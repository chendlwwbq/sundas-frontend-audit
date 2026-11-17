export type PaymentClient = 'page' | 'wap';

export function paymentClient(userAgent = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints): PaymentClient {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) ? 'wap' : 'page';
}

export function availablePaymentProviders(site: { providers: string[]; alipayProducts?: PaymentClient[] }, client: PaymentClient) {
    return site.providers.filter(provider => provider !== 'alipay' || (site.alipayProducts ?? ['page']).includes(client));
}
