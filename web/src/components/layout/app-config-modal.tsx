import { App, Button, Form, Input, Modal, Radio, Select, Switch } from "antd";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { audioFormatOptions, audioVoiceOptions, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import { computeMediaSize, computeVideoSize, inferMediaRatio, inferMediaScale, inferVideoRatio, mediaScaleOptions, parseVideoResolution, videoResolutionOptionsFromMap } from "@/lib/media-size";
import { modelOptionName, useConfigStore, type ModelCapability } from "@/stores/use-config-store";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "videoModel" | "textModel" | "audioModel";
    labelKey: string;
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", labelKey: "config.preferences.defaultImageModel" },
    { capability: "video", modelKey: "videoModel", labelKey: "config.preferences.defaultVideoModel" },
    { capability: "text", modelKey: "textModel", labelKey: "config.preferences.defaultTextModel" },
    { capability: "audio", modelKey: "audioModel", labelKey: "config.preferences.defaultAudioModel" },
];

export function AppConfigPanel({ showDoneButton = false }: { showDoneButton?: boolean }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const serverModels = useConfigStore((state) => state.serverModels);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const imageResolutionOptions = mediaScaleOptions.map((value) => ({ value, label: value === "auto" ? t("settingsPanels.common.auto") : value.toUpperCase() }));
    const selectedVideoModel = serverModels.find((model) => model.id === modelOptionName(config.videoModel) && model.capability === "video");
    const videoResolutionOptions = videoResolutionOptionsFromMap(selectedVideoModel?.resolutionMultipliers);

    const finishConfig = () => {
        setConfigDialogOpen(false);
        message.success(t(shouldPromptContinue ? "config.savedContinue" : "config.saved"));
        clearPromptContinue();
    };

    return (
        <>
            <Form layout="vertical" requiredMark={false}>
                <div className="mb-2 text-sm font-semibold">{t("config.preferences.defaultModels")}</div>
                <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {modelGroups.map((group) => (
                        <Form.Item key={group.modelKey} label={t(group.labelKey)} className="mb-0">
                            <ModelPicker config={config} value={config[group.modelKey]} onChange={(model) => updateConfig(group.modelKey, model)} capability={group.capability} fullWidth />
                        </Form.Item>
                    ))}
                </div>
                <div className="mb-2 text-sm font-semibold">{t("config.preferences.generation")}</div>
                <div className="grid gap-4 md:grid-cols-4">
                    <Form.Item label={t("config.preferences.canvasImageCount")} extra={t("config.preferences.canvasImageCountDescription")} className="mb-4">
                        <Input
                            type="number"
                            min={1}
                            max={15}
                            value={config.canvasImageCount}
                            onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                            onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                        />
                    </Form.Item>
                    <Form.Item label={t("config.preferences.imageResolution")} className="mb-4">
                        <Select value={inferMediaScale(config.size)} options={imageResolutionOptions} onChange={(scale) => updateConfig("size", computeMediaSize(scale, inferMediaRatio(config.size)))} />
                    </Form.Item>
                    <Form.Item label={t("config.preferences.videoResolution")} className="mb-4">
                        <Select
                            value={parseVideoResolution(config.vquality)}
                            options={videoResolutionOptions}
                            onChange={(value) => {
                                updateConfig("vquality", value);
                                const ratio = inferVideoRatio(config.size);
                                if (ratio !== "auto") updateConfig("size", computeVideoSize(value, ratio));
                            }}
                        />
                    </Form.Item>
                    <Form.Item label={t("config.preferences.audioVoice")} className="mb-4">
                        <Select value={config.audioVoice} options={audioVoiceOptions} onChange={(value) => updateConfig("audioVoice", value)} />
                    </Form.Item>
                    <Form.Item label={t("config.preferences.audioFormat")} className="mb-4">
                        <Select value={config.audioFormat} options={audioFormatOptions} onChange={(value) => updateConfig("audioFormat", value)} />
                    </Form.Item>
                    <Form.Item label={t("config.preferences.audioSpeed")} className="mb-4">
                        <Input
                            type="number"
                            min={0.25}
                            max={4}
                            step={0.05}
                            value={config.audioSpeed}
                            onChange={(event) => updateConfig("audioSpeed", event.target.value)}
                            onBlur={(event) => updateConfig("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                        />
                    </Form.Item>
                </div>
                <Form.Item label={t("config.preferences.regenerateBehavior")} className="mb-4">
                    <Radio.Group value={config.nodeRegenerateBehavior} onChange={(event) => updateConfig("nodeRegenerateBehavior", event.target.value)} className="flex flex-col gap-2">
                        <Radio value="overwrite">
                            <span className="block text-sm font-medium">{t("config.preferences.regenerateBehaviorOverwrite")}</span>
                            <span className="mt-0.5 block text-xs opacity-60">{t("config.preferences.regenerateBehaviorOverwriteDescription")}</span>
                        </Radio>
                        <Radio value="new-node">
                            <span className="block text-sm font-medium">{t("config.preferences.regenerateBehaviorNewNode")}</span>
                            <span className="mt-0.5 block text-xs opacity-60">{t("config.preferences.regenerateBehaviorNewNodeDescription")}</span>
                        </Radio>
                    </Radio.Group>
                </Form.Item>
                <Form.Item className="mb-4">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm">{t("config.preferences.autoFocusOnSelect")}</span>
                        <Switch checked={config.autoFocusOnSelect} onChange={(checked) => updateConfig("autoFocusOnSelect", checked)} />
                    </div>
                </Form.Item>
                <Form.Item label={t("config.preferences.audioInstructions")} className="mb-4">
                    <Input.TextArea rows={2} value={config.audioInstructions} placeholder={t("config.preferences.audioInstructionsPlaceholder")} onChange={(event) => updateConfig("audioInstructions", event.target.value)} />
                </Form.Item>
                <Form.Item label={t("config.preferences.systemPrompt")} className="mb-0">
                    <Input.TextArea rows={4} value={config.systemPrompt} placeholder={t("config.preferences.systemPromptPlaceholder")} onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                </Form.Item>
            </Form>
            {showDoneButton ? (
                <div className="mt-4 flex justify-end">
                    <Button type="primary" onClick={finishConfig}>
                        {t("common.done")}
                    </Button>
                </div>
            ) : null}
        </>
    );
}

export function AppConfigModal() {
    const { t } = useTranslation();
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">{t("config.title")}</div>
                    <div className="mt-1 text-xs font-normal text-muted-foreground">{t("config.modalDescription")}</div>
                </div>
            }
            open={isConfigOpen}
            width={980}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 12 } }}
            footer={null}
        >
            <AppConfigPanel showDoneButton />
        </Modal>
    );
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
}
