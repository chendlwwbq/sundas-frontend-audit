import { Home } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageTransition } from "@/components/layout/page-transition";

export default function NotFound() {
    const { t } = useTranslation();
    return (
        <PageTransition className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-page px-6 py-10 text-foreground">
                <section className="w-full max-w-md text-center">
                    <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-[16px] border border-border bg-card text-[22px] font-semibold tabular-nums text-muted-foreground">404</div>
                    <h1 className="text-[26px] font-semibold leading-9 tracking-[-0.01em]">{t("notFound.title")}</h1>
                    <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{t("notFound.description")}</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link to="/" className="jm-btn jm-btn-primary h-9 px-4">
                            <Home className="size-4" />
                            {t("notFound.home")}
                        </Link>
                    </div>
                </section>
            </main>
        </PageTransition>
    );
}
