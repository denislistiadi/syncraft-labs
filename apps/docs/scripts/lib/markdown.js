export function cleanMarkdown(content) {
  let text = content.replace(/^---[\s\S]*?---\n*/, "").trim();
  text = text.replace(/:::(danger|warning|caution|note|tip)(?:\[(.*?)\])?\n([\s\S]*?):::/g, (_, type, title, body) => {
    const label = title ? `**[${type.toUpperCase()}: ${title}]**` : `**[${type.toUpperCase()}]**`;
    const formattedBody = body.trim().split("\n").map((line) => `> ${line}`).join("\n");
    return `> ${label}\n>\n${formattedBody}`;
  });
  return text;
}
