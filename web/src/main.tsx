import "./audit/install";
import React from "react";

import { createRoot } from "react-dom/client";

import "antd/dist/reset.css";

import "streamdown/styles.css";

import "./styles/globals.css";

import { RouterProvider } from "react-router-dom";



import { AppProviders } from "@/components/layout/app-providers";

import { bootstrapLocale } from "@/i18n";

import { initAnalytics } from "@/lib/analytics";

import { initChunkReloadGuard } from "@/lib/chunk-reload-guard";

import { router } from "@/router";



// Analytics disabled in public audit export.

initChunkReloadGuard();



document.body.style.fontFamily = '"CapCut Sans","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';



function render() {

    createRoot(document.getElementById("root")!).render(

        <React.StrictMode>

            <AppProviders>

                <RouterProvider router={router} />

            </AppProviders>

        </React.StrictMode>,

    );

}



// 默认语言同步就绪，这里几乎不产生等待；若用户上次选了其它语言，会先取回对应资源再渲染，避免语言闪变。

// 资源加载失败也要照常渲染（回落到默认语言），不能因为语言包卡住首屏。

void bootstrapLocale().then(render, render);

