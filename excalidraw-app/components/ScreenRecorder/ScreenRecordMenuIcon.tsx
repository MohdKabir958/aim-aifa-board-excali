import React from "react";

/** Menu icon: record / screen capture */
export const ScreenRecordMenuIcon = React.memo(() => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="1em"
    height="1em"
    aria-hidden
  >
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="M22 10v4l-4-2v-4l4 2z" fill="currentColor" stroke="none" />
    <circle cx="8" cy="12" r="2" fill="currentColor" stroke="none" />
  </svg>
));

ScreenRecordMenuIcon.displayName = "ScreenRecordMenuIcon";
