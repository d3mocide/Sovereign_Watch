import { formatAnalysisText } from './aiAnalystFormatting';

interface AnalysisFormatterProps {
  text: string;
  isStreaming?: boolean;
  accentColor: string;
}

const renderInline = (text: string, accentColor: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const content = part.slice(2, -2).trim();
      const isHeader =
        content.includes(':') ||
        content.includes('&') ||
        content.toLowerCase().includes('section');

      return (
        <span
          key={index}
          className={
            isHeader
              ? `font-bold tracking-widest uppercase text-[10px] ${accentColor} drop-shadow-[0_0_8px_currentColor] block mb-1 mt-2`
              : 'font-bold text-white saturate-150'
          }
        >
          {content}
        </span>
      );
    }

    return part;
  });
};

export const AnalysisFormatter = ({
  text,
  isStreaming = false,
  accentColor,
}: AnalysisFormatterProps) => {
  if (!text && isStreaming) return null;

  const processed = formatAnalysisText(text);
  const lines = processed.split('\n');

  return (
    <div className="space-y-4 font-mono text-[11px] leading-relaxed text-left">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed && !isStreaming) return <div key={index} className="h-2" />;

        if (trimmed === '---' || trimmed === '***') {
          return <hr key={index} className="my-4 border-white/10" />;
        }

        const headerMatch = trimmed.match(/^(###+)\s+(.*)/);
        if (headerMatch) {
          const headerText = headerMatch[2].trim();
          return (
            <div key={index} className="mb-2 mt-4">
              <div
                className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${accentColor} drop-shadow-[0_0_8px_currentColor]`}
              >
                {headerText}
              </div>
            </div>
          );
        }

        const listMatch = line.match(/^[\s]*([•*-])\s+(.*)/);
        if (listMatch) {
          return (
            <div key={index} className="mb-2 flex gap-4 pl-2">
              <span className={`${accentColor} mt-1 shrink-0 select-none opacity-70`}>
                •
              </span>
              <span className="font-medium leading-relaxed text-white/80">
                {renderInline(listMatch[2], accentColor)}
              </span>
            </div>
          );
        }

        return (
          <div key={index} className="text-white/80">
            {renderInline(line, accentColor)}
          </div>
        );
      })}
    </div>
  );
};