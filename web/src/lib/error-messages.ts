import i18n from "@/i18n";

/**
 * Upstream moderation errors are classified on the server by provider error
 * codes. The browser only needs a fallback for an HTML gateway error page.
 */
export function friendlyErrorMessage(message: string): string {
    const text = String(message ?? "").trim();
    if (!text) return text;
    if (text.startsWith("<!DOCTYPE") || text.includes("<html") || text.includes("The origin web server returned an invalid or incomplete response to Cloudflare")) {
        return i18n.t("apiErrors.upstreamHtmlError");
    }
    return text;
}
