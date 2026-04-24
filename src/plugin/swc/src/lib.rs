use std::path::{Path, PathBuf};

use serde::Deserialize;
use swc_core::{
    common::{SourceMapper, Span, plugin::metadata::TransformPluginMetadataContextKind, source_map::SmallPos},
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

struct TransformVisitor {
    source: Option<SourceContext>,
    metadata: TransformPluginProgramMetadata,
}

struct Location<'a> {
    relative_path: &'a str,
    line: usize,
    col: usize,
}

impl TransformVisitor {
    fn new(metadata: TransformPluginProgramMetadata, config: PluginConfig) -> Self {
        let filename = metadata.get_context(&TransformPluginMetadataContextKind::Filename);
        let cwd = metadata.get_context(&TransformPluginMetadataContextKind::Cwd);

        // Prefer the explicit `projectRoot` option when provided so monorepo
        // setups emit paths the resolver expects; fall back to the host's CWD
        // so single-package projects just work.
        let base = config
            .project_root
            .as_deref()
            .or(cwd.as_deref())
            .map(PathBuf::from);

        let source = filename.map(|filename| {
            // Hosts like Turbopack hand us a filename that's already relative
            // to a workspace root above the project (common when a lockfile
            // exists further up the filesystem). If we try to compute a
            // relative path from that against an absolute `base`, pathdiff
            // gives up and we emit the host-workspace-prefixed path verbatim,
            // which the resolver can't open. Join with the host's cwd first
            // so pathdiff always sees two absolute paths.
            let filename_path = Path::new(&filename);
            let absolute: PathBuf = if filename_path.is_absolute() {
                filename_path.to_path_buf()
            } else if let Some(cwd_str) = cwd.as_deref() {
                Path::new(cwd_str).join(filename_path)
            } else {
                filename_path.to_path_buf()
            };

            SourceContext {
                relative_path: base
                    .as_deref()
                    .map(|base| relative_forward_slash(&absolute, base))
                    .unwrap_or_else(|| forward_slash(&absolute.to_string_lossy())),
            }
        });

        Self { source, metadata }
    }
}

impl VisitMut for TransformVisitor {
    fn visit_mut_jsx_opening_element(&mut self, node: &mut JSXOpeningElement) {
        node.visit_mut_children_with(self);

        let Some(source) = &self.source else {
            return;
        };

        if has_source_attr(node) || is_fragment_name(&node.name) {
            return;
        }

        let loc = self.metadata.source_map.lookup_char_pos(node.span.lo);
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

#[plugin_transform]
pub fn process_transform(
    mut program: Program,
    metadata: TransformPluginProgramMetadata,
) -> Program {
    let config: PluginConfig = metadata
        .get_transform_plugin_config()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    program.visit_mut_with(&mut TransformVisitor::new(metadata, config));
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

        let stamped = jsx_opening(
            "div",
            vec![jsx_str_attr("data-source-file", "src/app.tsx")],
        );
        assert!(has_source_attr(&stamped));
    }

    #[test]
    fn fragment_detection_matches_ident_and_member_expr() {
        // <Fragment>
        let frag_ident = JSXElementName::Ident(Ident::new(
            "Fragment".into(),
            DUMMY_SP,
            Default::default(),
        ));
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
