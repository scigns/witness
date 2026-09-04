<#--
  Witness Brand Book v1.0 (docs/brand/) email wrapper.

  This overrides only the shared layout macro that every Keycloak html email
  imports (base theme: theme/base/email/html/template.ftl, a bare
  <html><body>#nested</body></html> with no styling at all). Per-email-type
  files (password-reset.ftl, email-verification.ftl, etc.) and their message
  text are NOT overridden here — they inherit unchanged from the `keycloak`
  parent theme, so the actual send logic and argument wiring for every email
  type stays exactly as upstream. Only wording (messages/messages_en.properties,
  same placeholder positions) and this wrapper change.

  Email-client note: `<style>` covers modern clients (Gmail, Apple Mail,
  Outlook.com, Yahoo) and Outlook desktop's Word engine for the properties
  used here (color, font-family, line-height, margin) — it does not rely on
  float/position, which is what actually breaks there. The outer structure
  still uses table/inline styles per email-safe convention. Newsreader/IBM
  Plex cannot be loaded in email; per docs/brand/README.md this uses the
  closest web-safe fallback stacks instead, preserving hierarchy and voice.
-->
<#macro emailLayout>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Witness</title>
<style>
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  body { margin: 0; padding: 0; background-color: #f5f2ed; }
  .witness-body p {
    margin: 0 0 16px;
    color: #46423d;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px;
    line-height: 1.6;
  }
  .witness-body p:last-child { margin-bottom: 0; }
  /* Every current Keycloak email template (password-reset, email-verification,
     executeActions, identity-provider-link) puts its one action link alone in
     its own <p>, so styling every link as the Brand Book's Ink/Bone button is
     safe today. If a future template ever puts more than one link in flowing
     prose, give that link its own override rather than relaxing this rule. */
  .witness-body a {
    display: inline-block;
    padding: 12px 20px;
    background-color: #1b1917;
    color: #f5f2ed;
    font-weight: 600;
    text-decoration: none;
    border-radius: 4px;
  }
  .witness-body b, .witness-body strong {
    font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
    font-weight: 600;
    color: #1b1917;
  }
</style>
</head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f2ed;">
  <tr>
    <td align="center" style="padding: 40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr>
          <td style="padding: 0 8px 24px;">
            <span style="font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 400; letter-spacing: -0.01em; color: #1b1917;">Witness</span>
          </td>
        </tr>
        <tr>
          <td class="witness-body" style="background-color:#fffdf9; border:1px solid #dcd6cc; border-radius:4px; padding: 32px;">
<#nested>
          </td>
        </tr>
        <tr>
          <td style="padding: 24px 8px 0;">
            <p style="margin:0; font-family: 'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.6; color: #8a857d;">
              Witness is the evidence layer for work that has to be provable.<br>
              This is a transactional message about your account. If you weren't expecting it, no action is needed.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
</#macro>
