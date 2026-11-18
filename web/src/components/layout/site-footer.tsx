import { useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { BrandName, BrandWordmark } from "@/components/brand/brand-wordmark";
import { PromoContactButton } from "@/components/promo/promo-contact-button";
import "./site-footer.css";

const helpBtnStyle = { background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" as const };

export function SiteFooter() {
    const { t } = useTranslation();
    const year = new Date().getFullYear();
    const [helpOpen, setHelpOpen] = useState(false);

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
                                <li><Link to="/prompts">提示词模板库</Link></li>
                                <li><button type="button" style={helpBtnStyle} onClick={() => setHelpOpen(true)}>{t("footer.help")}</button></li>
                            </ul>
                        </div>
                        <div className="site-footer-col">
                            <h3>工作台与服务</h3>
                            <ul>
                                <li><Link to="/assets">素材中心</Link></li>
                                <li><Link to="/account">账户与积分</Link></li>
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
                        <span>请按创作场景核对生成内容后使用</span>
                    </div>
                </div>
            </div>

            <Modal title="使用指南与常见问题" open={helpOpen} onCancel={() => setHelpOpen(false)} footer={null} width={560} centered destroyOnHidden>
                <div className="space-y-4 py-1 text-sm leading-6 text-foreground">
                    <div>
                        <h4 className="font-semibold">1. 如何完成首次图片或视频生成？</h4>
                        <p className="mt-1 text-xs text-muted-foreground">进入「图片生成」或「视频生成」，选择模型后输入描述词（也可上传或从素材库插入参考图/视频/音频），确认积分预估后点击生成即可。</p>
                    </div>
                    <div>
                        <h4 className="font-semibold">2. 创作工作台、无限画布与素材中心有什么区别？</h4>
                        <p className="mt-1 text-xs text-muted-foreground">创作工作台适合单次/对话式生成图片与视频；无限画布支持多节点串联、分镜编排和 3D 导演台取景；素材中心集中管理上传及沉淀的图文音视频资产。</p>
                    </div>
                    <div>
                        <h4 className="font-semibold">3. 生成失败或显示部分成功怎么办？</h4>
                        <p className="mt-1 text-xs text-muted-foreground">可在失败卡片上点击「重试」按原请求参数重新提交，或在生成记录详情中查看具体失败原因与任务编号；若提示模型限制或参数缺失，请先按提示调整参考素材数量。</p>
                    </div>
                    <div>
                        <h4 className="font-semibold">4. 本地草稿、云端保存与导出机制是什么？</h4>
                        <p className="mt-1 text-xs text-muted-foreground">画布项目与生成成果同步保存至云端；未提交的创作草稿与部分素材缓存保存在当前浏览器本地。导出画布节点时，云端媒体会打包为真实文件，文本节点导出为文本文档。</p>
                    </div>
                </div>
            </Modal>
        </footer>
    );
}
