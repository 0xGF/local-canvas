use std::path::{Component, Path, PathBuf};

use swc_core::{
    common::{plugin::metadata::TransformPluginMetadataContextKind, SourceMapper, Span},
    ecma::{
        ast::{
            IdentName, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXElementName,
            JSXOpeningElement, Program, Str,
        },
        visit::{VisitMut, VisitMutWith},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

struct SourceContext {
    relative_path: String,
}

struct TransformVisitor {
    source: Option<SourceContext>,
    metadata: TransformPluginProgramMetadata,
}

impl TransformVisitor {
    fn new(metadata: TransformPluginProgramMetadata) -> Self {
        let filename = metadata.get_context(&TransformPluginMetadataContextKind::Filename);
        let cwd = metadata.get_context(&TransformPluginMetadataContextKind::Cwd);

        let source = filename.map(|filename| SourceContext {
            relative_path: cwd
                .as_deref()
                .map(|cwd| diff_paths(Path::new(&filename), Path::new(cwd)))
                .unwrap_or_else(|| filename.clone()),
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
        apply_source_attrs(node, &source.relative_path, loc.line, loc.col.0);
    }
}

fn apply_source_attrs(node: &mut JSXOpeningElement, relative_path: &str, line: usize, col: usize) {
    node.attrs.extend([
        make_attr("data-source-file", relative_path, node.span),
        make_attr("data-source-line", &line.to_string(), node.span),
        make_attr("data-source-col", &col.to_string(), node.span),
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
    // The lsp was buggin here
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

fn diff_paths(path: &Path, base: &Path) -> String {
    let path_components = normalize_components(path);
    let base_components = normalize_components(base);

    let common_len = path_components
        .iter()
        .zip(base_components.iter())
        .take_while(|(a, b)| a == b)
        .count();

    let mut result = PathBuf::new();

    for _ in common_len..base_components.len() {
        result.push("..");
    }

    for component in &path_components[common_len..] {
        result.push(component);
    }

    if result.as_os_str().is_empty() {
        ".".to_string()
    } else {
        result.to_string_lossy().into_owned()
    }
}

fn normalize_components(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            Component::Prefix(prefix) => Some(prefix.as_os_str().to_string_lossy().into_owned()),
            Component::RootDir => Some(std::path::MAIN_SEPARATOR.to_string()),
            Component::CurDir => None,
            Component::ParentDir => Some("..".to_string()),
        })
        .collect()
}

#[plugin_transform]
pub fn process_transform(
    mut program: Program,
    metadata: TransformPluginProgramMetadata,
) -> Program {
    program.visit_mut_with(&mut TransformVisitor::new(metadata));
    program
}

#[cfg(test)]
mod tests {
    use super::{apply_source_attrs, diff_paths};
    use std::path::Path;
    use swc_core::{
        common::DUMMY_SP,
        ecma::ast::{
            Ident, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXElementName,
            JSXOpeningElement, Str,
        },
    };

    #[test]
    fn computes_relative_path_for_nested_file() {
        assert_eq!(
            diff_paths(Path::new("/repo/src/app.tsx"), Path::new("/repo")),
            "src/app.tsx"
        );
    }

    #[test]
    fn computes_relative_path_for_sibling_directory() {
        assert_eq!(
            diff_paths(
                Path::new("/repo/packages/web/app.tsx"),
                Path::new("/repo/apps/docs")
            ),
            "../../packages/web/app.tsx"
        );
    }

    #[test]
    fn transforms_a_mocked_jsx_node_into_a_readable_tag_string() {
        let mut node = JSXOpeningElement {
            name: JSXElementName::Ident(Ident::new("Button".into(), DUMMY_SP, Default::default())),
            span: DUMMY_SP,
            attrs: vec![JSXAttrOrSpread::JSXAttr(JSXAttr {
                span: DUMMY_SP,
                name: JSXAttrName::Ident("className".into()),
                value: Some(JSXAttrValue::Str(Str {
                    span: DUMMY_SP,
                    value: "primary".into(),
                    raw: None,
                })),
            })],
            self_closing: false,
            type_args: None,
        };

        assert_eq!(render_opening_tag(&node), r#"<Button className="primary">"#);

        apply_source_attrs(&mut node, "src/components/Button.tsx", 12, 4);

        assert_eq!(
            render_opening_tag(&node),
            r#"<Button className="primary" data-source-file="src/components/Button.tsx" data-source-line="12" data-source-col="4">"#
        );
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
