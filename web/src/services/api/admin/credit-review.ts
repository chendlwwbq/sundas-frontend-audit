import type { ApiRequestInit } from "../client";
type Request = <T=unknown>(path:string,init?:ApiRequestInit)=>Promise<T>;
export type IssueReview={id:string;state:string;note:string;operator:string;createdAt:string};
export const creditReviewApi=(request:Request)=>({
 list:(issueType:string,targetId:string)=>request<{items:IssueReview[]}>(`/api/admin/credit-issues/reviews?${new URLSearchParams({issueType,targetId})}`),
 add:(issueType:string,targetId:string,state:string,note:string)=>request('/api/admin/credit-issues/reviews',{method:'POST',json:{issueType,targetId,state,note}}),
});
