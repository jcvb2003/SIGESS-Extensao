export function resolveGuiaDownloadUrlFromAnchor(botaoEmitirGuia: HTMLAnchorElement): string | null {
  const onclick = botaoEmitirGuia.getAttribute("onclick") || "";
  const match = /MontaCaminhoCompleto\('([^']+)'\)/.exec(onclick);
  if (match?.[1]) {
    return new URL(match[1], `${window.location.origin}/portal/`).toString();
  }

  const redirectMatch = /redirecionar\('([^']+)'/.exec(onclick);
  if (redirectMatch?.[1]) {
    return new URL(redirectMatch[1], `${window.location.origin}/portal/`).toString();
  }

  const href = botaoEmitirGuia.getAttribute("href") || "";
  const hrefRedirectMatch = /redirecionar\('([^']+)'/.exec(href);
  if (hrefRedirectMatch?.[1]) {
    return new URL(hrefRedirectMatch[1], `${window.location.origin}/portal/`).toString();
  }

  if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
    return new URL(href, window.location.origin).toString();
  }

  return null;
}
