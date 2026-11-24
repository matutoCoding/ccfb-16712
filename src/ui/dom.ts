export type DomChild = Node | string | number | false | null | undefined | DomChild[];

export type Props = Record<string, unknown> & {
  class?: string;
  html?: string;
  dataset?: Record<string, string | number | boolean>;
};

function appendChild(el: HTMLElement, child: DomChild) {
  if (child === false || child === null || child === undefined) return;
  if (Array.isArray(child)) {
    child.forEach((c) => appendChild(el, c));
    return;
  }
  el.append(child instanceof Node ? child : document.createTextNode(String(child)));
}

export function h<T extends keyof HTMLElementTagNameMap>(tag: T, props?: Props | null, ...children: DomChild[]): HTMLElementTagNameMap[T] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'html') el.innerHTML = String(value);
      else if (key === 'dataset' && typeof value === 'object') {
        for (const [dk, dv] of Object.entries(value as Record<string, string | number | boolean>)) el.dataset[dk] = String(dv);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === 'value') {
        (el as HTMLInputElement).value = String(value);
      } else if (key === 'checked') {
        (el as HTMLInputElement).checked = Boolean(value);
      } else if (key === 'selected') {
        (el as HTMLOptionElement).selected = Boolean(value);
      } else {
        el.setAttribute(key, String(value === true ? '' : value));
      }
    }
  }
  appendChild(el, children);
  if (props && props.value !== undefined && (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
    el.value = String(props.value);
  }
  if (props && props.checked !== undefined && el instanceof HTMLInputElement) el.checked = Boolean(props.checked);
  return el;
}

export function clear(el: HTMLElement) {
  el.replaceChildren();
}

export function icon(name: string, size = 18): SVGSVGElement {
  const paths: Record<string, string> = {
    projects: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h3a1 1 0 0 1 1 1v11"/><path d="M7 7h4M7 11h4M7 15h4M2 21h20"/>',
    glass: '<path d="M5 3h14l-2 18H7L5 3Z"/><path d="M5 9h14M8 3 7 21M16 3l1 18"/>',
    reflection: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/><path d="m6 6 2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',
    risk: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17.5h.01"/>',
    measures: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2.1-2.1 1.9-3.7Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    upload: '<path d="M12 15V3m0 0L8 7m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    play: '<path d="m7 4 13 8-13 8V4Z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>',
    bird: '<path d="M16 7a2 2 0 1 0 0 .01Z"/><path d="M3 13c4-1 6-4 9-7 1 4 4 6 9 7-4 1-7 3-9 7-2-4-5-6-9-7Z"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-9 17-9 0 10-3 17-9 17Z"/><path d="M4 20c4-6 8-8 13-10"/>',
    water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths[name] ?? paths.check;
  return svg;
}
