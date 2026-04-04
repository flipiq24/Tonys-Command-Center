import { getDocs } from "./google-auth";

export async function appendToDoc(documentId: string, text: string) {
  const docs = getDocs();

  const docRes = await docs.documents.get({ documentId });
  const content = docRes.data.body?.content || [];

  let endIndex = 1;
  for (const el of content) {
    if (el.endIndex != null) endIndex = el.endIndex;
  }

  const insertIndex = Math.max(1, endIndex - 1);

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: insertIndex },
            text: "\n" + text,
          },
        },
      ],
    },
  });
}

export async function getDocText(documentId: string): Promise<string> {
  const docs = getDocs();
  const res = await docs.documents.get({ documentId });

  let text = "";
  for (const el of res.data.body?.content || []) {
    if (el.paragraph?.elements) {
      for (const e of el.paragraph.elements) {
        text += e.textRun?.content || "";
      }
    }
  }
  return text;
}
