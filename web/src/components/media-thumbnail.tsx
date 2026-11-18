import { useEffect, useState, type ReactNode } from 'react';
import { useMediaPreview } from '@/hooks/use-media-preview';

// Small cards never fetch a cloud original to stand in for its derivative.
export function MediaThumbnail({source,kind='image',alt='',className='grid size-full place-items-center overflow-hidden',imageClassName='size-full object-cover',fallback}: {
    source?:string;kind?:'image'|'video';alt?:string;className?:string;imageClassName?:string;fallback?:ReactNode;
}) {
    const [element,setElement]=useState<HTMLElement|null>(null),[visible,setVisible]=useState(false);
    useEffect(()=>{
        if (!element) return;
        if (typeof IntersectionObserver==='undefined') {setVisible(true);return;}
        const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)));
        observer.observe(element);return()=>observer.disconnect();
    },[element]);
    const preview=useMediaPreview(visible?source:undefined);
    const url=visible?(preview.cloud?preview.url:source):undefined;
    return <span ref={setElement} className={className} title={preview.error?`${preview.error}，点击可重试缩略图`:undefined} onClick={()=>{if(preview.error)preview.retry();}}>
        {url?(kind==='video'&&!preview.cloud?<video src={url} muted preload="metadata" className={imageClassName}/>:<img src={url} alt={alt} loading="lazy" decoding="async" className={imageClassName}/>):fallback}
    </span>;
}
