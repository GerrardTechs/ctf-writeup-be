import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'h1','h2','h3','h4','p','strong','em','code','pre',
  'blockquote','ul','ol','li','a','img','br','hr',
  'table','thead','tbody','tr','th','td'
];

const ALLOWED_ATTR = ['href', 'src', 'alt', 'class'];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'oninput'],
  });
}

export function sanitizeText(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}