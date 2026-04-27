use std::path::{Path, PathBuf};

use serde::Deserialize;
use swc_core::{
    common::{
        plugin::metadata::TransformPluginMetadataContextKind, source_map::SmallPos, SourceMapper,
        Span,
    },
    ecma::{
        ast::{
            IdentName, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXElementName,
            JSXOpeningElement, Program, Str,
        },
        visit::{VisitMut, VisitMutWith},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

/// Plugin options, read from the `swcPlugins` entry in `next.config.js` (or
/// `.swcrc`). JSON-serialized by the host and deserialized here.
///
/// ```json
/// ["local-canvas-swc-plugin", { "projectRoot": "/abs/path/to/repo" }]
/// ```
///
/// When omitted, paths are resolved relative to the SWC host's CWD — which
/// matches the Babel plugin's default. Useful to override in monorepos where
/// the tool is invoked from a workspace root but sources live in a nested
/// directory.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginConfig {
    #[serde(default)]
    project_root: Option<String>,
}

struct SourceContext {
    relative_path: String,
}

struct TransformVisitor<'a, S: SourceMapper + ?Sized> {
    source: Option<SourceContext>,
    source_map: &'a S,
}

struct Location<'a> {
    relative_path: &'a str,
    line: usize,
    col: usize,
}

/// Resolve the project-relative source path from host-provided metadata. Kept
/// separate from the visitor so tests can construct a `SourceContext` without
/// a live plugin host.
fn resolve_source_context(
    filename: Option<String>,
    cwd: Option<String>,
    config: &PluginConfig,
) -> Option<SourceContext> {
    // Prefer the explicit `projectRoot` option when provided so monorepo
    // setups emit paths the resolver expects; fall back to the host's CWD
    // so single-package projects just work.
    let base = config
        .project_root
        .as_deref()
        .or(cwd.as_deref())
        .map(PathBuf::from);

    filename.map(|filename| {
        // Hosts like Turbopack hand us a filename that's already relative
        // to a workspace root somewhere above the project (common when a
        // lockfile exists further up the filesystem). If we diff that
        // against an absolute `base`, pathdiff gives up and we emit the
        // host-workspace-prefixed path verbatim — which the resolver
        // can't open.
        //
        // Three ways to produce a clean project-relative path:
        //   (1) filename is already absolute → diff against `base` directly
        //   (2) the host gives us its Cwd → join, then diff
        //   (3) neither — walk projectRoot's trailing components looking
        //       for the longest match against filename's leading
        //       components and strip it. Works regardless of *how far*
        //       above the project the host's workspace root sits.
        let filename_path = Path::new(&filename);

        // Resolution order is deliberately strip-before-join:
        //   (a) absolute filename → diff against `base` directly
        //   (b) try strip_project_root_overlap first — if filename's
        //       leading components match a trailing suffix of
        //       `base`, that's a high-confidence alignment
        //   (c) fall back to joining the host's cwd and diffing
        //   (d) give up — emit filename as-is
        //
        // (b) has to come before (c) because Turbopack's metadata is
        // mismatched: it reports `cwd` as the project dir but hands us
        // filenames relative to a workspace root *above* the project.
        // Blindly doing `cwd.join(filename)` produces a nonexistent
        // path that `pathdiff` then "successfully" diffs, giving us a
        // silently-wrong result. The strip heuristic only returns Some
        // when there's a real overlap, so it won't false-positive.
        let resolved: Option<String> = if filename_path.is_absolute() {
            base.as_deref()
                .map(|b| relative_forward_slash(filename_path, b))
        } else {
            base.as_deref()
                .and_then(|b| strip_project_root_overlap(filename_path, b))
                .or_else(|| {
                    cwd.as_deref().and_then(|cwd_str| {
                        let absolute = Path::new(cwd_str).join(filename_path);
                        base.as_deref()
                            .map(|b| relative_forward_slash(&absolute, b))
                    })
                })
        };

        SourceContext {
            relative_path: resolved
                .unwrap_or_else(|| forward_slash(&filename_path.to_string_lossy())),
        }
    })
}

impl<'a, S: SourceMapper + ?Sized> TransformVisitor<'a, S> {
    fn new(source: Option<SourceContext>, source_map: &'a S) -> Self {
        Self { source, source_map }
    }
}

impl<'a, S: SourceMapper + ?Sized> VisitMut for TransformVisitor<'a, S> {
    fn visit_mut_jsx_opening_element(&mut self, node: &mut JSXOpeningElement) {
        node.visit_mut_children_with(self);

        let Some(source) = &self.source else {
            return;
        };

        if has_source_attr(node) || is_fragment_name(&node.name) {
            return;
        }

        let loc = self.source_map.lookup_char_pos(node.span.lo);
        apply_source_attrs(
            node,
            &Location {
                relative_path: &source.relative_path,
                line: loc.line,
                col: loc.col.to_usize(),
            },
        );
    }
}

fn apply_source_attrs(node: &mut JSXOpeningElement, loc: &Location) {
    let path = loc.relative_path;
    let line = loc.line.to_string();
    let col = loc.col.to_string();

    node.attrs.extend([
        make_attr("data-source-file", path, node.span),
        make_attr("data-source-line", &line, node.span),
        make_attr("data-source-col", &col, node.span),
    ]);
}

fn has_source_attr(node: &JSXOpeningElement) -> bool {
    node.attrs.iter().any(|attr| match attr {
        JSXAttrOrSpread::JSXAttr(JSXAttr {
            name: JSXAttrName::Ident(name),
            ..
        }) => name.sym == *"data-source-file",
        _ => false,
    })
}

fn is_fragment_name(name: &JSXElementName) -> bool {
    // swc_core marks `JSXElementName` as `#[non_exhaustive]`, which demands a
    // wildcard arm during wasm compilation. Host-target builds see the
    // currently-enumerated variants as exhaustive and would warn the arm is
    // unreachable — suppress just that warning, not all unreachable patterns.
    #[allow(unreachable_patterns)]
    match name {
        JSXElementName::Ident(ident) => ident.sym == *"Fragment" || ident.sym.is_empty(),
        JSXElementName::JSXMemberExpr(member) => member.prop.sym == *"Fragment",
        JSXElementName::JSXNamespacedName(_) => false,
        _ => false,
    }
}

fn make_attr(name: &str, value: &str, span: Span) -> JSXAttrOrSpread {
    JSXAttrOrSpread::JSXAttr(JSXAttr {
        span,
        name: JSXAttrName::Ident(IdentName::new(name.into(), span)),
        value: Some(JSXAttrValue::Str(Str {
            span,
            value: value.into(),
            raw: None,
        })),
    })
}

/// Relative path from `base` to `path`, always using forward slashes so the
/// overlay's source resolver — which normalizes to POSIX — can match it on
/// Windows too. Falls back to the absolute path on platforms where
/// `pathdiff` can't compute a relation (e.g. different drive letters).
fn relative_forward_slash(path: &Path, base: &Path) -> String {
    match pathdiff::diff_paths(path, base) {
        Some(rel) if !rel.as_os_str().is_empty() => forward_slash(&rel.to_string_lossy()),
        _ => forward_slash(&path.to_string_lossy()),
    }
}

fn forward_slash(s: &str) -> String {
    s.replace('\\', "/")
}

/// When the host hands us a relative filename (e.g. Turbopack pre-strips
/// against its workspace root), find the longest run of leading filename
/// components that match a trailing suffix of `project_root` and drop them
/// from the filename. Returns `None` if no overlap exists.
///
/// Example: filename = `local-canvas/test-app-next/src/app/page.tsx`,
/// project_root = `/Users/…/local-canvas/test-app-next`. The last two
/// components of `project_root` (`local-canvas`, `test-app-next`) match the
/// first two of `filename`, so the result is `src/app/page.tsx`.
fn strip_project_root_overlap(filename: &Path, project_root: &Path) -> Option<String> {
    let fname: Vec<_> = filename
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    let root: Vec<_> = project_root
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    if fname.is_empty() || root.is_empty() {
        return None;
    }
    // Try progressively shorter trailing slices of project_root. First
    // successful alignment wins — this is the longest overlap.
    let max_overlap = fname.len().min(root.len());
    for take in (1..=max_overlap).rev() {
        let trailing = &root[root.len() - take..];
        if fname[..take]
            .iter()
            .zip(trailing.iter())
            .all(|(a, b)| a == b)
            && fname.len() > take
        {
            return Some(fname[take..].join("/"));
        }
    }
    None
}

#[plugin_transform]
pub fn process_transform(
    mut program: Program,
    metadata: TransformPluginProgramMetadata,
) -> Program {
    let config: PluginConfig = metadata
        .get_transform_plugin_config()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let filename = metadata.get_context(&TransformPluginMetadataContextKind::Filename);
    let cwd = metadata.get_context(&TransformPluginMetadataContextKind::Cwd);
    let source = resolve_source_context(filename, cwd, &config);
    program.visit_mut_with(&mut TransformVisitor::new(source, &metadata.source_map));
    program
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use swc_core::{
        common::DUMMY_SP,
        ecma::ast::{
            Ident, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXElementName,
            JSXOpeningElement, Str,
        },
    };

    #[test]
    fn relative_path_for_nested_file() {
        assert_eq!(
            relative_forward_slash(Path::new("/repo/src/app.tsx"), Path::new("/repo")),
            "src/app.tsx"
        );
    }

    #[test]
    fn relative_path_joins_cwd_when_filename_is_relative() {
        // Simulates Turbopack's behavior: filename is already relative to
        // a workspace root above the project, cwd is that workspace root,
        // projectRoot is the project itself. We expect paths clean of both.
        let cwd = Path::new("/workspace-root");
        let project_root = Path::new("/workspace-root/apps/web");
        let filename = Path::new("apps/web/src/app/page.tsx");

        let absolute = if filename.is_absolute() {
            filename.to_path_buf()
        } else {
            cwd.join(filename)
        };

        assert_eq!(
            relative_forward_slash(&absolute, project_root),
            "src/app/page.tsx"
        );
    }

    #[test]
    fn relative_path_for_sibling_directory() {
        assert_eq!(
            relative_forward_slash(
                Path::new("/repo/packages/web/app.tsx"),
                Path::new("/repo/apps/docs")
            ),
            "../../packages/web/app.tsx"
        );
    }

    #[test]
    fn strip_project_root_overlap_finds_longest_match() {
        // Turbopack handed us `local-canvas/test-app-next/src/app/page.tsx`
        // (relative to a workspace root above our project). projectRoot is
        // the project's absolute path. Trailing two components match the
        // filename's leading two — we strip and return `src/app/page.tsx`.
        assert_eq!(
            strip_project_root_overlap(
                Path::new("local-canvas/test-app-next/src/app/page.tsx"),
                Path::new("/Users/me/dev/local-canvas/test-app-next"),
            ),
            Some("src/app/page.tsx".to_string())
        );
    }

    #[test]
    fn strip_project_root_overlap_single_segment() {
        // The common single-level-up case: workspace root is projectRoot's
        // parent, so filename has one leading segment to strip.
        assert_eq!(
            strip_project_root_overlap(
                Path::new("apps/web/src/app.tsx"),
                Path::new("/monorepo/apps/web"),
            ),
            Some("src/app.tsx".to_string())
        );
    }

    #[test]
    fn strip_project_root_overlap_returns_none_when_no_alignment() {
        // Filename's leading components don't appear in projectRoot's
        // trailing components → no safe strip, return None so the caller
        // can fall back to emitting the filename verbatim.
        assert_eq!(
            strip_project_root_overlap(
                Path::new("src/app/page.tsx"),
                Path::new("/Users/me/dev/some-other-app"),
            ),
            None
        );
    }

    #[test]
    fn relative_path_normalizes_windows_separators() {
        // Emulate what `pathdiff` emits on Windows by passing backslash-heavy
        // input; `relative_forward_slash` is expected to flip them regardless
        // of host OS so the overlay's POSIX-normalized lookups match.
        let result = forward_slash("src\\components\\Button.tsx");
        assert_eq!(result, "src/components/Button.tsx");
    }

    #[test]
    fn apply_source_attrs_appends_three_attrs() {
        let mut node = jsx_opening("Button", vec![jsx_str_attr("className", "primary")]);

        assert_eq!(render_opening_tag(&node), r#"<Button className="primary">"#);

        apply_source_attrs(
            &mut node,
            &Location {
                relative_path: "src/components/Button.tsx",
                line: 12,
                col: 4,
            },
        );

        assert_eq!(
            render_opening_tag(&node),
            r#"<Button className="primary" data-source-file="src/components/Button.tsx" data-source-line="12" data-source-col="4">"#
        );
    }

    #[test]
    fn has_source_attr_detects_existing_tag() {
        let plain = jsx_opening("div", vec![]);
        assert!(!has_source_attr(&plain));

        let stamped = jsx_opening("div", vec![jsx_str_attr("data-source-file", "src/app.tsx")]);
        assert!(has_source_attr(&stamped));
    }

    #[test]
    fn fragment_detection_matches_ident_and_member_expr() {
        // <Fragment>
        let frag_ident =
            JSXElementName::Ident(Ident::new("Fragment".into(), DUMMY_SP, Default::default()));
        assert!(is_fragment_name(&frag_ident));

        // <></>
        let empty_ident =
            JSXElementName::Ident(Ident::new("".into(), DUMMY_SP, Default::default()));
        assert!(is_fragment_name(&empty_ident));

        // <Button>
        let button =
            JSXElementName::Ident(Ident::new("Button".into(), DUMMY_SP, Default::default()));
        assert!(!is_fragment_name(&button));
    }

    fn jsx_opening(name: &str, attrs: Vec<JSXAttrOrSpread>) -> JSXOpeningElement {
        JSXOpeningElement {
            name: JSXElementName::Ident(Ident::new(name.into(), DUMMY_SP, Default::default())),
            span: DUMMY_SP,
            attrs,
            self_closing: false,
            type_args: None,
        }
    }

    fn jsx_str_attr(name: &str, value: &str) -> JSXAttrOrSpread {
        JSXAttrOrSpread::JSXAttr(JSXAttr {
            span: DUMMY_SP,
            name: JSXAttrName::Ident(name.into()),
            value: Some(JSXAttrValue::Str(Str {
                span: DUMMY_SP,
                value: value.into(),
                raw: None,
            })),
        })
    }

    fn render_opening_tag(node: &JSXOpeningElement) -> String {
        let tag_name = match &node.name {
            JSXElementName::Ident(ident) => ident.sym.to_string(),
            _ => panic!("test helper only supports identifier tag names"),
        };

        let attrs = node
            .attrs
            .iter()
            .map(|attr| match attr {
                JSXAttrOrSpread::JSXAttr(JSXAttr {
                    name: JSXAttrName::Ident(name),
                    value: Some(JSXAttrValue::Str(value)),
                    ..
                }) => format!(r#"{}="{}""#, name.sym, value.value.to_string_lossy()),
                _ => panic!("test helper only supports string literal JSX attrs"),
            })
            .collect::<Vec<_>>();

        if attrs.is_empty() {
            format!("<{}>", tag_name)
        } else {
            format!("<{} {}>", tag_name, attrs.join(" "))
        }
    }
}

#[cfg(test)]
mod e2e_tests {
    //! End-to-end: parse real JSX → run the visitor → code-gen the result.
    //! Covers the composed plugin flow that the per-helper unit tests don't.

    use super::*;
    use std::sync::Arc;
    use swc_common::{FileName, SourceMap};
    use swc_ecma_ast::EsVersion;
    use swc_ecma_codegen::{text_writer::JsWriter, Emitter};
    use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax, TsSyntax};
    use swc_ecma_visit::VisitMutWith;

    fn transform(input: &str, relative_path: &str) -> String {
        let cm: Arc<SourceMap> = Default::default();
        let fm = cm.new_source_file(
            Arc::new(FileName::Real(relative_path.into())),
            input.to_owned(),
        );
        let lexer = Lexer::new(
            Syntax::Typescript(TsSyntax {
                tsx: true,
                ..Default::default()
            }),
            EsVersion::EsNext,
            StringInput::from(&*fm),
            None,
        );
        let mut parser = Parser::new_from(lexer);
        let module = parser.parse_module().expect("parse failed");
        let mut program = Program::Module(module);

        let source_ctx = Some(SourceContext {
            relative_path: relative_path.to_string(),
        });
        program.visit_mut_with(&mut TransformVisitor::new(source_ctx, cm.as_ref()));

        let mut buf = vec![];
        {
            let writer = JsWriter::new(cm.clone(), "\n", &mut buf, None);
            let mut emitter = Emitter {
                cfg: Default::default(),
                cm: cm.clone(),
                comments: None,
                wr: writer,
            };
            emitter.emit_program(&program).expect("emit failed");
        }
        String::from_utf8(buf).expect("utf-8")
    }

    #[test]
    fn stamps_data_source_attrs_on_plain_jsx() {
        let input = "\
export default function Button() {
  return <button className=\"primary\">Click</button>;
}
";
        let output = transform(input, "src/Button.tsx");

        // Attrs land on the opening tag with the expected values.
        assert!(
            output.contains(r#"data-source-file="src/Button.tsx""#),
            "missing file attr:\n{output}"
        );
        // The JSX opens on line 2 (after the `export default function` header).
        assert!(
            output.contains(r#"data-source-line="2""#),
            "missing or wrong line attr:\n{output}"
        );
        assert!(
            output.contains(r#"data-source-col="#),
            "missing col attr:\n{output}"
        );
    }

    #[test]
    fn skips_fragments_and_preserves_existing_attrs() {
        // `<></>` fragment sugar and explicit `<Fragment>` both bypass the
        // stamp. Non-fragment children still get tagged.
        let input = "\
export default function List() {
  return (
    <>
      <li data-source-file=\"already-stamped.tsx\">keep me</li>
      <li>stamp me</li>
    </>
  );
}
";
        let output = transform(input, "src/List.tsx");

        // Pre-existing data-source-file is preserved verbatim — visitor bails
        // on nodes that already carry the marker.
        assert!(
            output.contains(r#"data-source-file="already-stamped.tsx""#),
            "pre-stamped attr was overwritten:\n{output}"
        );
        // The un-stamped sibling picks up our path.
        assert!(
            output.contains(r#"data-source-file="src/List.tsx""#),
            "new-stamp missing on unstamped sibling:\n{output}"
        );
        // Fragment itself has no opening tag to stamp — verify no stray
        // attr leaked onto the enclosing empty tag.
        let fragment_opens = output.matches("<>").count();
        assert_eq!(fragment_opens, 1, "fragment lost or doubled:\n{output}");
    }

    #[test]
    fn no_filename_context_is_a_no_op() {
        // When resolve_source_context returns None (e.g. host didn't pass a
        // filename), the visitor must not stamp anything.
        let input = "export const x = <div>hi</div>;\n";
        let cm: Arc<SourceMap> = Default::default();
        let fm = cm.new_source_file(Arc::new(FileName::Anon), input.to_string());
        let lexer = Lexer::new(
            Syntax::Typescript(TsSyntax {
                tsx: true,
                ..Default::default()
            }),
            EsVersion::EsNext,
            StringInput::from(&*fm),
            None,
        );
        let mut parser = Parser::new_from(lexer);
        let module = parser.parse_module().expect("parse failed");
        let mut program = Program::Module(module);

        program.visit_mut_with(&mut TransformVisitor::new(None, cm.as_ref()));

        let mut buf = vec![];
        {
            let writer = JsWriter::new(cm.clone(), "\n", &mut buf, None);
            let mut emitter = Emitter {
                cfg: Default::default(),
                cm: cm.clone(),
                comments: None,
                wr: writer,
            };
            emitter.emit_program(&program).expect("emit failed");
        }
        let output = String::from_utf8(buf).expect("utf-8");

        assert!(
            !output.contains("data-source-"),
            "stamped attrs despite missing source context:\n{output}"
        );
    }
}
