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
  const textToInsert = "\n" + text;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: insertIndex },
            text: textToInsert,
          },
        },
        {
          updateParagraphStyle: {
            range: {
              startIndex: insertIndex,
              endIndex: insertIndex + textToInsert.length,
            },
            paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
            fields: "namedStyleType",
          },
        },
        {
          updateTextStyle: {
            range: {
              startIndex: insertIndex,
              endIndex: insertIndex + textToInsert.length,
            },
            textStyle: { fontSize: { magnitude: 11, unit: "PT" }, bold: false },
            fields: "fontSize,bold",
          },
        },
      ],
    },
  });
}

export async function prependToDoc(documentId: string, text: string) {
  const docs = getDocs();

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: text + "\n\n",
          },
        },
      ],
    },
  });
}

/**
 * Insert text before the "FORMAT FOR NEW ENTRIES" section in the journal doc.
 * If the marker is not found, appends at the end.
 */
export async function insertJournalEntry(documentId: string, text: string) {
  const docs = getDocs();
  const docRes = await docs.documents.get({ documentId });
  const content = docRes.data.body?.content || [];

  // Find the index of "FORMAT FOR NEW ENTRIES" text
  let insertIndex = -1;
  for (const el of content) {
    if (el.paragraph?.elements) {
      for (const e of el.paragraph.elements) {
        const run = e.textRun?.content || "";
        if (run.includes("FORMAT FOR NEW ENTRIES")) {
          // Insert before this paragraph's start — go back past the horizontal rule too
          insertIndex = el.startIndex ?? -1;
          // Try to find the horizontal rule before FORMAT section
          const elIdx = content.indexOf(el);
          if (elIdx > 0) {
            const prev = content[elIdx - 1];
            // Check if previous element is a section break or horizontal rule
            if (prev?.sectionBreak || prev?.paragraph?.elements?.[0]?.horizontalRule) {
              insertIndex = prev.startIndex ?? insertIndex;
            }
          }
          break;
        }
      }
    }
    if (insertIndex > 0) break;
  }

  // Fallback: append at end if marker not found
  if (insertIndex <= 0) {
    let endIndex = 1;
    for (const el of content) {
      if (el.endIndex != null) endIndex = el.endIndex;
    }
    insertIndex = Math.max(1, endIndex - 1);
  }

  const entryText = "\n________________________________________________________________________________\n\n" + text + "\n\n";

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: insertIndex },
            text: entryText,
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
