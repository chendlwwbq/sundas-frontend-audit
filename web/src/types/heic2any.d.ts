declare module "heic2any" {
    type ConvertOptions = {
        blob: Blob;
        toType?: string;
        quality?: number;
        multiple?: boolean;
        gifInterval?: number;
    };
    const heic2any: (options: ConvertOptions) => Promise<Blob | Blob[]>;
    export default heic2any;
}
