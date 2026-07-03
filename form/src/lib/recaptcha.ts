declare global {
  interface Window {
    grecaptcha?: {
      ready(cb: () => void): void;
      execute(siteKey: string, opts: { action: string }): Promise<string>;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string;

let carregando: Promise<void> | null = null;

export function carregarRecaptcha(): Promise<void> {
  if (!SITE_KEY) return Promise.reject(new Error('VITE_RECAPTCHA_SITE_KEY ausente'));
  if (window.grecaptcha) return Promise.resolve();
  if (carregando) return carregando;
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY)}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      // Zera o cache: sem isto, uma falha transitória de rede deixaria a
      // promise rejeitada cacheada e TODO envio seguinte falharia até o F5.
      carregando = null;
      s.remove();
      reject(new Error('falha ao carregar a verificação anti-bot. Tente enviar novamente.'));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

export async function executarRecaptcha(action: string): Promise<string> {
  await carregarRecaptcha();
  return new Promise<string>((resolve, reject) => {
    if (!window.grecaptcha) return reject(new Error('grecaptcha indisponível'));
    window.grecaptcha.ready(() => {
      window.grecaptcha!
        .execute(SITE_KEY, { action })
        .then(resolve)
        .catch(reject);
    });
  });
}
