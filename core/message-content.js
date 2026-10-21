export function unwrapMessage(message) {
  let current = message?.message || message;
  while (current?.ephemeralMessage?.message
    || current?.viewOnceMessage?.message
    || current?.viewOnceMessageV2?.message
    || current?.viewOnceMessageV2Extension?.message
    || current?.documentWithCaptionMessage?.message) {
    current = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.viewOnceMessageV2Extension?.message
      || current.documentWithCaptionMessage?.message;
  }
  return current || {};
}
