//! SMTP mailer for oral exam reports.
//!
//! Sends one report per student through Gmail SMTP (`smtp.gmail.com:587`,
//! STARTTLS) using the colleur's address as sender and an App Password as
//! credential (Profile settings — generated in the Google account, 2FA
//! required; the 16-char password includes spaces for readability that are NOT
//! part of the actual secret).
//!
//! Since round 10 the report body is an IMAGE (PNG — the SVG option was
//! removed in round 16: html-to-image only produces `<foreignObject>` that
//! render in browsers, blank in librsvg viewers, and the inlined styles
//! bloated the files to ~10 Mo) captured in the frontend by `html-to-image`:
//! the same rendering is guaranteed on every client. The email is a
//! `multipart/related` built here: an HTML part that references the image as
//! an inline attachment (`<img src="cid:rapport@azprose">`) + the image part
//! itself (Content-ID `rapport@azprose`). This module only builds
//! RFC-compliant messages and delivers them over the STARTTLS connection.

use base64::Engine;
use lettre::message::header::{ContentDisposition, ContentId, ContentType};
use lettre::message::{Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Content-ID shared with the frontend wrapper (`buildReportEmailHtml`).
const REPORT_CID: &str = "rapport@azprose";

/// One email to deliver: an HTML wrapper + the report image (inline part).
#[derive(Serialize, Deserialize, Clone)]
pub struct EmailMessage {
    /// Destination address (student's `email_eleve`).
    pub to: String,
    pub subject: String,
    /// HTML wrapper referencing the image via `cid:rapport@azprose`.
    pub html: String,
    /// Report image, base64-encoded (no `data:` prefix).
    #[serde(rename = "imageBase64")]
    pub image_base64: String,
    /// MIME type of the image (always `image/png` since round 16).
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

/// A failed delivery (one per recipient — the other messages still go out).
#[derive(Serialize, Deserialize, Clone)]
pub struct SendFailure {
    pub to: String,
    pub error: String,
}

/// Builds the RFC-compliant message (multipart/related: HTML + inline image).
/// Pure: tested without any SMTP connection.
fn build_email(from: &Mailbox, to: Mailbox, msg: &EmailMessage) -> Result<Message, String> {
    let image_bytes = base64::engine::general_purpose::STANDARD
        .decode(msg.image_base64.as_str())
        .map_err(|e| format!("image base64 invalide : {e}"))?;
    let image_type = ContentType::parse(&msg.mime_type)
        .map_err(|e| format!("type MIME invalide ({}) : {e}", msg.mime_type))?;

    let html_part = SinglePart::builder()
        .header(ContentType::TEXT_HTML)
        .header(ContentDisposition::inline())
        .body(msg.html.clone());
    let image_part = SinglePart::builder()
        .header(image_type)
        .header(ContentId::from(format!("<{REPORT_CID}>")))
        .header(ContentDisposition::inline())
        .body(image_bytes);

    let mut related = MultiPart::related().singlepart(html_part);
    related = related.singlepart(image_part);

    Message::builder()
        .from(from.clone())
        .to(to)
        .subject(msg.subject.as_str())
        .multipart(related)
        .map_err(|e| format!("message invalide : {e}"))
}

/// Send one email per recipient through Gmail SMTP.
///
/// `from` is the colleur's Gmail address (must match the app-password account),
/// `password` its 16-char App Password. A single STARTTLS connection is reused
/// for the whole batch. Failures are collected per recipient instead of
/// aborting the batch; the frontend reports them to the user.
#[tauri::command]
pub fn send_colle_emails(
    from: String,
    password: String,
    messages: Vec<EmailMessage>,
) -> Result<Vec<SendFailure>, String> {
    if messages.is_empty() {
        return Ok(Vec::new());
    }
    let from_mailbox: Mailbox = from
        .parse()
        .map_err(|e| format!("Adresse expéditrice invalide ({from}) : {e}"))?;

    let mailer = SmtpTransport::starttls_relay("smtp.gmail.com")
        .map_err(|e| format!("Configuration SMTP Gmail impossible : {e}"))?
        .port(587)
        .timeout(Some(Duration::from_secs(30)))
        .credentials(Credentials::new(from.clone(), password))
        .build();

    let mut failures: Vec<SendFailure> = Vec::new();
    for msg in &messages {
        let to_mailbox: Mailbox = match msg.to.parse() {
            Ok(m) => m,
            Err(e) => {
                failures.push(SendFailure {
                    to: msg.to.clone(),
                    error: format!("adresse invalide : {e}"),
                });
                continue;
            }
        };
        let email = match build_email(&from_mailbox, to_mailbox, msg) {
            Ok(m) => m,
            Err(e) => {
                failures.push(SendFailure {
                    to: msg.to.clone(),
                    error: e,
                });
                continue;
            }
        };
        if let Err(e) = mailer.send(&email) {
            failures.push(SendFailure {
                to: msg.to.clone(),
                error: e.to_string(),
            });
        }
    }
    Ok(failures)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(image_base64: &str, mime_type: &str) -> EmailMessage {
        EmailMessage {
            to: "eleve@example.com".into(),
            subject: "Colle de maths — Jean".into(),
            html: r#"<img src="cid:rapport@azprose">"#.into(),
            image_base64: image_base64.into(),
            mime_type: mime_type.into(),
        }
    }

    #[test]
    fn build_email_assembles_multipart_with_inline_image() {
        let from: Mailbox = "colleur@gmail.com".parse().unwrap();
        let to: Mailbox = "eleve@example.com".parse().unwrap();
        let image = base64::engine::general_purpose::STANDARD.encode(b"\x89PNG-fake-image");
        let email = build_email(&from, to, &msg(&image, "image/png")).unwrap();

        // La version sérialisée du message contient toutes les parties MIME :
        // on vérifie le Content-ID partagé et le type de l'image inline.
        let formatted = email.formatted();
        let body_str = std::str::from_utf8(&formatted).unwrap_or_default();
        assert!(body_str.contains("rapport@azprose"));
        assert!(body_str.contains("multipart/related"));
        assert!(body_str.contains("image/png"));
    }

    #[test]
    fn build_email_rejects_invalid_base64() {
        let from: Mailbox = "colleur@gmail.com".parse().unwrap();
        let to: Mailbox = "eleve@example.com".parse().unwrap();
        let err = build_email(&from, to, &msg("pas-du-base64-!!", "image/png")).unwrap_err();
        assert!(err.contains("base64 invalide"));
    }

    #[test]
    fn build_email_rejects_unknown_mime() {
        let from: Mailbox = "colleur@gmail.com".parse().unwrap();
        let to: Mailbox = "eleve@example.com".parse().unwrap();
        let image = base64::engine::general_purpose::STANDARD.encode(b"x");
        let err = build_email(&from, to, &msg(&image, "pas-un-mime")).unwrap_err();
        assert!(err.contains("type MIME invalide"));
    }
}
