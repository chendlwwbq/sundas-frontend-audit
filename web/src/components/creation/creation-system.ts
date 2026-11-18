import coreCss from "@astryxdesign/core/astryx.css?inline";
import themeCss from "@astryxdesign/theme-neutral/theme.css?inline";

// Scoped to the application shell, never the full-screen canvas editor.
export const creationSystemCss = `@scope (.creation-shell) {${`${coreCss}\n${themeCss}`.replaceAll(":root", ":scope")}}`;
