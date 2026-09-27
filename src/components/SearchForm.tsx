"use client";

import { useState, FormEvent } from "react";

interface SearchFormProps {
  onSearch: (query: string) => void;
  disabled?: boolean;
}

export default function SearchForm({ onSearch, disabled }: SearchFormProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="search-form">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search GIF... (e.g. kucing, laugh, anime)"
        className="search-input"
        disabled={disabled}
      />
      <button type="submit" className="search-btn" disabled={disabled || value.trim().length === 0}>
        Search
      </button>
    </form>
  );
}
