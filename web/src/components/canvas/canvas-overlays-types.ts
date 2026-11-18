import type { uploadImage } from "@/services/image-storage";

export type uploadedImageResult = Awaited<ReturnType<typeof uploadImage>>;
