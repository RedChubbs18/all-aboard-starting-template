// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

afterEach(cleanup);

describe("Markdown images", () => {
  it("renders a same-origin image inline with its alt text", () => {
    render(<Markdown source="![Floor 3 plan](/media/example-house-floor-3.svg)" />);
    const img = screen.getByRole("img", { name: "Floor 3 plan" });
    expect(img).toHaveAttribute("src", "/media/example-house-floor-3.svg");
  });
  it("keeps an external image as a placeholder with a link, never an <img>", () => {
    const { container } = render(<Markdown source="![Plan](https://example.test/a.png)" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/Image: Plan/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open image/ })).toHaveAttribute("href", "https://example.test/a.png");
  });
  it("does not load a traversal path inline", () => {
    const { container } = render(<Markdown source="![x](/media/../secret.png)" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
