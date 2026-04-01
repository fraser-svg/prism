import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  safeJsonEmbed,
  renderNavBar,
  renderMarkdown,
  relativeTimeScript,
} from "./visualizer-common";

describe("escapeHtml", () => {
  it("escapes all dangerous characters", () => {
    expect(escapeHtml('<script>"alert\'&')).toBe(
      "&lt;script&gt;&quot;alert&#39;&amp;"
    );
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles strings with no special characters", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("safeJsonEmbed", () => {
  it("escapes </script> in output", () => {
    const data = { message: '</script><script>alert("xss")</script>' };
    const result = safeJsonEmbed(data);
    expect(result).not.toContain("</script>");
    expect(result).toContain("<\\/script>");
  });

  it("strips absolute paths when stripPath is provided", () => {
    const data = { path: "/Users/test/project/file.ts", name: "test" };
    const result = safeJsonEmbed(data, "/Users/test/project");
    expect(result).not.toContain("/Users/test/project");
    expect(result).toContain("./file.ts");
  });

  it("works without stripPath", () => {
    const data = { a: 1, b: "hello" };
    const result = safeJsonEmbed(data);
    expect(JSON.parse(result)).toEqual({ a: 1, b: "hello" });
  });

  it("handles generic types", () => {
    interface Custom { x: number; y: string }
    const data: Custom = { x: 42, y: "test" };
    const result = safeJsonEmbed<Custom>(data);
    expect(JSON.parse(result)).toEqual({ x: 42, y: "test" });
  });
});

describe("renderNavBar", () => {
  it("marks pipeline as active", () => {
    const html = renderNavBar("pipeline");
    expect(html).toContain("nav-active");
    expect(html).toContain('href="PIPELINE.html"');
    expect(html).toContain('href="PROJECT.html"');
    // Pipeline link has active class
    expect(html).toMatch(/PIPELINE\.html.*nav-active/);
  });

  it("marks project as active", () => {
    const html = renderNavBar("project");
    expect(html).toContain("nav-active");
    // Project link has active class
    expect(html).toMatch(/PROJECT\.html.*nav-active/);
  });
});

describe("renderMarkdown", () => {
  it("converts headings", () => {
    expect(renderMarkdown("# Title")).toContain("<h1>Title</h1>");
    expect(renderMarkdown("## Section")).toContain("<h2>Section</h2>");
    expect(renderMarkdown("### Sub")).toContain("<h3>Sub</h3>");
  });

  it("converts bullet lists", () => {
    const md = "- item one\n- item two";
    const html = renderMarkdown(md);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<li>item two</li>");
    expect(html).toContain("</ul>");
  });

  it("converts code fences", () => {
    const md = "```\nconst x = 1;\n```";
    const html = renderMarkdown(md);
    expect(html).toContain("<pre><code>");
    expect(html).toContain("const x = 1;");
    expect(html).toContain("</code></pre>");
  });

  it("converts bold and italic", () => {
    const md = "This is **bold** and *italic* text";
    const html = renderMarkdown(md);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("converts inline code", () => {
    const md = "Use `pathExists` here";
    const html = renderMarkdown(md);
    expect(html).toContain("<code>pathExists</code>");
  });

  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   ")).toBe("");
  });

  it("escapes HTML in content", () => {
    const md = "# <script>alert('xss')</script>";
    const html = renderMarkdown(md);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("relativeTimeScript", () => {
  it("returns a JS function string", () => {
    const script = relativeTimeScript();
    expect(script).toContain("function relativeTime");
    expect(script).toContain("data-timestamp");
  });
});
