import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { BrandName, BrandWordmark } from "@/components/brand/brand-wordmark";
import { PromoContactButton } from "@/components/promo/promo-contact-button";
import "./site-footer.css";

export function SiteFooter() {
    const { t } = useTranslation();
    const year = new Date().getFullYear();

    return (
        <footer className="site-footer">
            <div className="site-footer-band">
                <div className="site-footer-main">
                    <div className="site-footer-brand">
                        <Link to="/" className="site-footer-logo">
                            <img src="/brand/sundas-symbol.svg" alt="" className="site-footer-symbol" />
                            <BrandWordmark height={18} decorative />
                        </Link>
                        <p className="site-footer-tagline">{t("footer.tagline")}</p>
                    </div>

                    <nav className="site-footer-cols" aria-label="footer">
                        <div className="site-footer-col">
                            <h3>{t("footer.product")}</h3>
                            <ul>
                                <li><Link to="/image">{t("footer.productImage")}</Link></li>
                                <li><Link to="/video">{t("footer.productVideo")}</Link></li>
                                <li><Link to="/canvas">{t("footer.productMore")}</Link></li>
                                <li><Link to="/prompts">{t("footer.productOpen")}</Link></li>
                            </ul>
                        </div>
                        <div className="site-footer-col">
                            <h3>{t("footer.resources")}</h3>
                            <ul>
                                <li><span>{t("footer.changelog")}</span></li>
                                <li><span>{t("footer.tutorial")}</span></li>
                                <li><span>{t("footer.help")}</span></li>
                                <li><span>{t("footer.contact")}</span></li>
                            </ul>
                        </div>
                        <div className="site-footer-col">
                            <h3>{t("footer.company")}</h3>
                            <ul>
                                <li><span>{t("footer.about")}</span></li>
                                <li><span>{t("footer.join")}</span></li>
                                <li>
                                    <PromoContactButton />
                                </li>
                            </ul>
                        </div>
                    </nav>
                </div>
            </div>

            <div className="site-footer-band">
                <div className="site-footer-bottom">
                    <span className="site-footer-copy">
                        <BrandName text={t("footer.copyright", { year })} imageClassName="opacity-70" />
                    </span>
                    <div className="site-footer-legal">
                        <span>{t("footer.terms")}</span>
                        <i aria-hidden="true" />
                        <span>{t("footer.privacy")}</span>
                        <i aria-hidden="true" />
                        <span>{t("footer.disclaimer")}</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
