import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import selectedIndicator from "../assets/dropdown-selected.svg";
import "./SelectMenu.css";

export type SelectChoice = {
  value: string;
  icon: string | null;
};

type SelectMenuProps = {
  ariaLabel: string;
  className: string;
  choices: readonly SelectChoice[];
  label: string | null;
  variant: "ghost" | "solid";
  value: string;
  onChange: (value: string) => void;
  floating?: boolean;
};

export function SelectMenu({ ariaLabel, className, choices, label, variant, value, onChange, floating = false }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [floatingStyle, setFloatingStyle] = useState<{ left: number; bottom: number; minWidth: number } | null>(null);
  const selected = value === "" ? null : choices.find((choice) => choice.value === value)!;
  const SelectedIcon = selected?.icon;
  const hasIcons = choices.some((choice) => choice.icon !== null);
  const tone = value.startsWith("Buy") ? "is-buy" : value.startsWith("Sell") ? "is-sell" : "";
  const floatingContext = floating ? triggerRef.current?.closest(".oe-field, .oe-header-field")?.className ?? "" : "";

  const closeOnBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setOpen(false);
  };

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") setOpen(false);
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!floating || !open || triggerRef.current === null) return;
    const updatePosition = () => {
      const { left, top, width } = triggerRef.current!.getBoundingClientRect();
      setFloatingStyle({ left, bottom: window.innerHeight - top + 4, minWidth: width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [floating, open]);

  const list = open ? (
    <div className={`select-menu-list ${hasIcons ? "has-icons" : ""} ${floating ? "is-floating" : ""}`} role="listbox" aria-label={ariaLabel} style={floatingStyle ?? undefined}>
      {choices.map((choice) => {
        const isSelected = choice.value === value;
        const icon = choice.icon;
        return (
          <button
            className={`select-menu-option ${choice.value.startsWith("Buy") ? "is-buy" : choice.value.startsWith("Sell") ? "is-sell" : ""} ${isSelected ? "is-selected" : ""}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            key={choice.value}
            onMouseDown={floating ? (event) => event.preventDefault() : undefined}
            onClick={() => { onChange(choice.value); setOpen(false); }}
          >
            {icon ? <img className="select-menu-option-icon" src={icon} alt="" /> : null}
            <span>{choice.value}</span>
            {isSelected ? <img className="select-menu-check" src={selectedIndicator} alt="" /> : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className={`select-menu is-${variant} ${tone} ${className}`} onBlur={closeOnBlur} onKeyDown={handleKeys}>
      <button className="select-menu-trigger" ref={triggerRef} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {SelectedIcon ? <img className="select-menu-trigger-icon" src={SelectedIcon} alt="" /> : null}
        {label ? <span className={selected ? "select-menu-label" : "select-menu-placeholder"}>{label}</span> : null}
        {selected ? <span className="select-menu-value">{value}</span> : null}
        <ChevronDown className="select-menu-chevron" aria-hidden="true" />
      </button>
      {floating && list ? createPortal(<div className={`select-menu ${floatingContext}`}>{list}</div>, document.body) : list}
    </div>
  );
}
