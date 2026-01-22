import React from 'react';

interface SimpleTextProps {
  content: string;
}

export function SimpleText({ content }: SimpleTextProps) {
  if (!content) return null;
  
  // Convert markdown-style bold to HTML and newlines to br
  const html = content
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
  
  return (
    <div 
      className="whitespace-pre-wrap text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
