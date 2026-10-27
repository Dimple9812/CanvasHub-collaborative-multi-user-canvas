import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toolbar } from "./Toolbar";
import { useEditor } from "../../store/editor";

describe("Toolbar", () => {
  beforeEach(() => useEditor.getState().reset());

  it("exposes every tool as a labelled toggle button and switches tools", async () => {
    render(<Toolbar canEdit />);
    expect(screen.getByRole("toolbar", { name: "Drawing tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select (V)" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Sticky note (S)" }));
    expect(useEditor.getState().tool).toBe("sticky");
    expect(screen.getByRole("button", { name: "Sticky note (S)" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows only navigation tools to viewers", () => {
    render(<Toolbar canEdit={false} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Rectangle/ })).not.toBeInTheDocument();
  });
});
