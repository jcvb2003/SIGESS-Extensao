// Logic specific for eSocial (mostly handled by background/DOMInjector strategies now, 
// but this script persists for page-context specific actions if needed)

console.log("eSocial Content Script Loaded");

// Exemplo: Se precisar de listeners específicos na página que o background não pega
// Atualmente, a estratégia 'ESocialStrategy' no background faz o trabalho pesado de login.
// Este arquivo pode ser usado para customizações futuras na página interna do eSocial.

// Mantendo compatibilidade com manifesto original que injetava 'content-esocial.js'
// para detectar carregamento de competências, etc.

if (location.href.includes("FolhaPagamento/Listagem/Competencias")) {
    // Auto-activator logic logic if settings allow?
    // For now, simple logging as the orchestration moved to background/strategies
}
