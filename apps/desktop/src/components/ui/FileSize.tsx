import { formatFileSize } from "../../utils/formatters";

export function FileSize({ bytes, className = "", isSpeed = false }: { bytes: number, className?: string, isSpeed?: boolean }) {
  const formatted = formatFileSize(bytes);
  const parts = formatted.split(' ');
  
  return (
    <span className={`inline-flex items-baseline ${className}`}>
      {parts.map((part, index) => {
        const isNumber = !isNaN(Number(part)) && part.trim() !== "";
        const isLastUnit = !isNumber && index === parts.length - 1;
        return (
          <span 
            key={index} 
            className={isNumber ? "font-bold font-mono tracking-tight text-[1.1em]" : "text-[0.7em] font-bold text-muted-foreground ml-0.5 mr-1.5 uppercase tracking-wider"}
          >
            {part}{isSpeed && isLastUnit ? <span className="text-primary/70 ml-[1px]">/s</span> : null}
          </span>
        );
      })}
    </span>
  );
}
