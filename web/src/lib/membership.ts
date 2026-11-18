export function formatGenerationDiscount(discount = 1) {
    return discount > 0 && discount < 1 ? `${Number((discount * 10).toFixed(2))} 折` : "标准计费";
}
