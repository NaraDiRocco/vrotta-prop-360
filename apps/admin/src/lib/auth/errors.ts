/**
 * Supabase Auth devuelve sus mensajes en inglés y pensados para logs, no para
 * una persona no técnica llenando un formulario. Traducimos los que vamos a
 * ver de verdad con email+contraseña; lo que no reconocemos se muestra tal
 * cual (mejor un inglés crudo que ocultar el problema).
 */
const PATTERNS: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada (y spam).'],
  [/user already registered|email address is already registered/i, 'Ya existe una cuenta con ese correo. Probá iniciar sesión.'],
  [/unable to validate email address/i, 'Ese correo no tiene un formato válido.'],
  [
    /password should be at least (\d+) characters?/i,
    (m) => `La contraseña tiene que tener al menos ${m[1]} caracteres.`,
  ],
  [/password is known to be weak|password is too weak|pwned/i, 'Esa contraseña es demasiado común. Probá con otra.'],
  [/new password should be different from the old password/i, 'La nueva contraseña tiene que ser distinta de la anterior.'],
  [/email rate limit exceeded/i, 'Se enviaron demasiados correos. Esperá unos minutos y probá de nuevo.'],
  [
    /for security purposes, you can only request this after (\d+) seconds?/i,
    (m) => `Por seguridad, esperá ${m[1]} segundos antes de volver a pedirlo.`,
  ],
  [/token has expired or is invalid|invalid or expired/i, 'El enlace venció o ya se usó. Pedí uno nuevo.'],
  [/user not found/i, 'No encontramos una cuenta con ese correo.'],
  [/same_password/i, 'La nueva contraseña tiene que ser distinta de la anterior.'],
];

/** Traduce un mensaje de error de Supabase Auth a español rioplatense, plano. */
export function translateAuthError(message: string): string {
  for (const [pattern, replacement] of PATTERNS) {
    const match = message.match(pattern);
    if (match) return typeof replacement === 'string' ? replacement : replacement(match);
  }
  return message;
}
