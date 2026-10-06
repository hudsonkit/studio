# Talkie behavior programming study

This discussion-only wireframe explores an Iris-style conversation beside a source file and its test evidence. It preserves the existing Hudson-backed Studio shell and dark theme. Restrained blue marks the selected stage and study actions; green identifies revised source and expected matches. Monospace is reserved for source, filenames, and trace data.

The six chronological states are prompt, generation, code ready with a synthetic recording, example test result, follow-up, and revision. Conversation sits left of source and test evidence on desktop. On narrow screens the sequence becomes two rows and the panes stack, with the shared Studio sidebar collapsed for reading. Source may scroll horizontally rather than lose indentation.

Navigation changes local illustrative state. The message field is read-only, generation is paused, and the recording is a fixed synthetic fixture. Proposed TypeScript APIs and expected results are labeled throughout. There is no Monaco dependency, agent connection, recording access, or workflow execution. Accepting and enabling a behavior remain discussion questions.

Finish review: ship for this scope. Desktop prompt and revision captures establish hierarchy, readable source, and clear revision emphasis. The narrow revision capture confirms readable navigation and conversation with the existing sidebar collapsed; it does not show the entire stacked study. Below-fold test and revision content was inspected in source. Typecheck, 126 tests, and an empty design-detector result were reported by the implementing agent. No shared-shell changes are required.
