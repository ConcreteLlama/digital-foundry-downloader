import { Box, Button, Collapse, FormHelperText, Grid, InputAdornment, List, ListItemButton, TextField, Typography } from "@mui/material";
import { DfContentInfo, MediaInfo, randomDummyContentInfo } from "df-downloader-common";
import { DfFilenameTemplateVarDefinitions, helperVars, testTemplate, TestTemplateError } from "df-downloader-common/utils/filename-template-utils";
import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

type TemplateExample = {
  value: string;
  unknownVarMessage?: string;
  error?: any;
}
const makeTemplateExample = (filenameTemplate: string, contentInfo: DfContentInfo, mediaInfo: MediaInfo, currentValue?: TemplateExample | null): TemplateExample => {
  try {
    return {
      value: testTemplate(filenameTemplate, contentInfo, mediaInfo),
    }
  } catch (e: any) {
    if (e instanceof TestTemplateError) {
      if (e.reason === 'unknown-var') {
        return {
          value: "",
          unknownVarMessage: e.message
        }
      }
    }
    return {
      value: currentValue?.value || "",
      error: e
    }
  }
}

const randomMediaInfo = (contentInfo: DfContentInfo) => contentInfo.mediaInfo[Math.floor(Math.random() * contentInfo.mediaInfo.length)];

export const TemplateBuilderField = () => {
  const context = useFormContext();

  const setTemplate = (newTemplate: string) => {
    context.setValue("filenameTemplate", newTemplate);
  }

  const template = useWatch({
    name: "filenameTemplate",
  }) as string;
  const initialValueRef = useRef<string>(template);
  const validTags = Object.entries(DfFilenameTemplateVarDefinitions).map(([key, value]) => ({
    name: key,
    description: value.description
  }));
  const validHelpers = helperVars;

  const [templateExample, setTemplateExample] = useState<TemplateExample | null>();

  const [showVariableList, setShowVariableList] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [dummyContentInfo, setDummyContentInfo] = useState<DfContentInfo>(randomDummyContentInfo());
  const [dummyMediaInfo, setDummyMediaInfo] = useState<MediaInfo>(randomMediaInfo(dummyContentInfo));

  useEffect(() => {
    setDummyMediaInfo(randomMediaInfo(dummyContentInfo));
  }, [dummyContentInfo]);

  useEffect(() => {
    return setTemplateExample(makeTemplateExample(template, dummyContentInfo, dummyMediaInfo, templateExample));
  }, [template, dummyContentInfo]);
  const templateHelperText = `${templateExample?.value ? `${templateExample.value}` : ""}${templateExample?.error ? ` (template currently invalid)` : ""}${templateExample?.unknownVarMessage ? `${templateExample.unknownVarMessage}` : ""}`;

  // TODO: Ultimately I could make this better - treat tags as a single entity, if backspace after a tag, remove the whole tag,
  // if click within a tag select the whole tag, if click after a tag, move the cursor to the end of the tag
  // For now this will at least prevent the cursor from being inside a tag when the user selects a tag from the list
  const sanitizeCursorPosition = (startPos: number) => {
      // if we're inside a tag, change the start pos to 1 after the close of the tag }}
      const templateFromStart = template.substring(startPos);
      // So basically I want to check if the next } character is after a {{ and if so, move the cursor to 1 after the next } or }}
      const closeTagIndex = templateFromStart.indexOf("}");
      const openTagIndex = templateFromStart.indexOf("{{");
      if (closeTagIndex < openTagIndex || closeTagIndex >= 0 && openTagIndex === -1) {
        const offset = templateFromStart.charAt(closeTagIndex + 1) === "}" ? 2 : 1;
        return startPos + closeTagIndex + offset;
      }
      return startPos;
  }

  const handleTagSelect = (selectedOption: string) => {
    const tag = `{{${selectedOption}}}`;
    if (textareaRef.current) {
      const startPos = sanitizeCursorPosition(textareaRef.current.selectionStart);
      const endPos = sanitizeCursorPosition(textareaRef.current.selectionEnd);
      const newValue = `${template.substring(0, startPos)}${tag}${template.substring(endPos)}`;
      setTemplate(newValue);
      setCursorPosition(startPos + tag.length);
    }
  };

  const handleHelperSelect = (selectedOption: string) => {
    // This should work like handleTagSelect but do {{#ifIn}}{{/ifIn}} and insert the cursor just after the tag name
    const openTag = `{{#${selectedOption}}}`;
    const closeTag = `{{/${selectedOption}}}`;
    if (textareaRef.current) {
      const startPos = sanitizeCursorPosition(textareaRef.current.selectionStart);
      const endPos = sanitizeCursorPosition(textareaRef.current.selectionEnd);
      const newValue = `${template.substring(0, startPos)}${openTag}${closeTag}${template.substring(endPos)}`;
      setTemplate(newValue);
      setCursorPosition(startPos + openTag.length - 2);
    }
  };

  useEffect(() => {
    if (textareaRef.current && cursorPosition) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
    }
  }, [cursorPosition]);

  const handleTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTemplate(e.target.value);
  }

  const handleFocus = () => {
    setShowVariableList(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setShowVariableList(false);
    }
  };

  return (
      <Box onFocus={handleFocus} onBlur={handleBlur} tabIndex={-1}>
        <Box display="flex" alignItems="center">
          <TextField
            name="filenameTemplate"
            label="Filename Template"
            helperText={
              <FormHelperText component="div">
                <Typography
                  component="span"
                  variant="body2"
                  color="textSecondary"
                  onClick={() => setDummyContentInfo(randomDummyContentInfo(dummyContentInfo.name))}
                  style={{ cursor: 'pointer' }}
                >
                  {templateHelperText}
                </Typography>
              </FormHelperText>
            }
            autoComplete="off"
            value={template}
            onChange={handleTemplateChange}
            inputRef={textareaRef}
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Button onClick={() => setTemplate(initialValueRef.current)}>Reset</Button>
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <Collapse in={showVariableList}>
          <Box mt={2} sx={{
            maxHeight: "50vh",
            overflow: 'auto',
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: '#f1f1f1',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#888',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: '#555',
            },
          }}>
            <Typography variant="h6">Variables</Typography>
            <List>
              {validTags.map((tag) => (
                <ListItemButton key={tag.name} onClick={() => handleTagSelect(tag.name)}>
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Typography variant="body1">{`{{${tag.name}}}`}</Typography>
                    </Grid>
                    <Grid item xs={8}>
                      <Typography variant="body2">{tag.description}</Typography>
                    </Grid>
                  </Grid>
                </ListItemButton>
              ))}
            </List>
            <Typography variant="h6">Helpers</Typography>
            <List>
              {Object.entries(validHelpers).map(([name, description]) => (
                <ListItemButton key={name} onClick={() => handleHelperSelect(name)}>
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Typography variant="body1">{`{{#${name}}}`}</Typography>
                    </Grid>
                    <Grid item xs={8}>
                      <Typography variant="body2">{description}</Typography>
                    </Grid>
                  </Grid>
                </ListItemButton>
              ))}
            </List>
          </Box>
        </Collapse>
      </Box>
  );
};