/**
 * Envoi des rapports de colles par email (pont IPC vers mailer.rs).
 *
 * La commande Rust `send_colle_emails` ouvre UNE connexion SMTP Gmail
 * (smtp.gmail.com:587, STARTTLS) et délivre tous les messages ; les échecs
 * sont collectés par destinataire (le batch ne s'arrête pas au premier
 * échec).
 *
 * Depuis le round 10 le corps du rapport est une IMAGE (PNG — l'option SVG a
 * été retirée au round 16) capturée par html-to-image : le mail est un
 * multipart/related (HTML wrapper + image inline `cid:rapport@azprose`)
 * construit par mailer.rs.
 */
import { invoke } from "@tauri-apps/api/core";

/** Un email de rapport prêt à partir (wrapper HTML + image du rapport). */
export interface ColleEmailMessage {
  to: string;
  subject: string;
  /** Wrapper HTML référençant l'image via `cid:rapport@azprose`. */
  html: string;
  /** Image du rapport en base64 (sans préfixe `data:`). */
  imageBase64: string;
  /** Type MIME de l'image : toujours `image/png`. */
  mimeType: "image/png";
}

/** Un destinataire en échec (+ raison). */
export interface SendFailure {
  to: string;
  error: string;
}

/** Envoie le lot ; résout la liste des échecs (vide = tout est parti). */
export async function sendColleEmails(
  from: string,
  password: string,
  messages: ColleEmailMessage[],
): Promise<SendFailure[]> {
  return await invoke<SendFailure[]>("send_colle_emails", { from, password, messages });
}
