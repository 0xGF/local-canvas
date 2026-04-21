import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  ImageFillEditor,
  imageFillToCss,
  imageFitToBackgroundSize,
  type ImageFillValue,
} from "../image-fill-editor.js";

afterEach(cleanup);

const base: ImageFillValue = {
  url: "https://example.com/img.png",
  fit: "cover",
  positionX: 50,
  positionY: 50,
  repeat: "no-repeat",
};

describe("imageFitToBackgroundSize", () => {
  it("maps each fit keyword", () => {
    expect(imageFitToBackgroundSize("cover")).toBe("cover");
    expect(imageFitToBackgroundSize("contain")).toBe("contain");
    expect(imageFitToBackgroundSize("fill")).toBe("100% 100%");
    expect(imageFitToBackgroundSize("none")).toBe("auto");
  });
});

describe("imageFillToCss", () => {
  it("quotes the url and emits all four CSS pieces", () => {
    const css = imageFillToCss(base);
    expect(css.backgroundImage).toBe("url('https://example.com/img.png')");
    expect(css.backgroundSize).toBe("cover");
    expect(css.backgroundPosition).toBe("50% 50%");
    expect(css.backgroundRepeat).toBe("no-repeat");
  });

  it("emits 'none' when url is empty", () => {
    expect(imageFillToCss({ ...base, url: "" }).backgroundImage).toBe("none");
  });
});

describe("ImageFillEditor", () => {
  it("shows the current url in the text input", () => {
    const { container } = render(
      <ImageFillEditor value={base} onChange={() => {}} />,
    );
    const urlInput = container.querySelector('input[placeholder^="https"]') as HTMLInputElement;
    expect(urlInput.value).toBe("https://example.com/img.png");
  });

  it("commits a changed url on Enter", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ImageFillEditor value={base} onChange={onChange} />,
    );
    const urlInput = container.querySelector('input[placeholder^="https"]') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: "https://other.example/pic.jpg" } });
    fireEvent.keyDown(urlInput, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://other.example/pic.jpg",
    }));
  });

});
