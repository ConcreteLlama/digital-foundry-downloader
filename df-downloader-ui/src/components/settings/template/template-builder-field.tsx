import { Box, Button, Collapse, Grid, InputAdornment, List, ListItemButton, TextField, Typography } from "@mui/material";
import { DfContentInfo, filterAndMap, MediaInfo, randomDummyContentInfo } from "df-downloader-common";
import { DfFilenameTemplateVarDefinitions, helperVars, testTemplate, TestTemplateError } from "df-downloader-common/utils/filename-template-utils";
import { useEffect, useRef, useState } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import { generalScrollbarProps } from "../../../utils/webkit-scrollbar-props.ts";

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

export type TemplateBuilderFieldProps = {
  alwaysExpand?: boolean;
};
export const TemplateBuilderField = ({alwaysExpand = false}: TemplateBuilderFieldProps) => {
  const context = useFormContext();

  const setTemplate = (newTemplate: string) => {
    context.setValue("filenameTemplate", newTemplate, {
      shouldDirty: true,
    });
  }

  const template = useWatch({
    name: "filenameTemplate",
  }) as string;
  const initialValueRef = useRef<string>(template);
  const validTags = filterAndMap(Object.entries(DfFilenameTemplateVarDefinitions), ([,{hidden}]) => !hidden, ([key, value]) => ({
    name: key,
    description: value.description
  }));
  const validHelpers = helperVars;

  const [templateExample, setTemplateExample] = useState<TemplateExample | null>();

  const [showVariableList, setShowVariableList] = useState(alwaysExpand || false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [dummyContentInfo, setDummyContentInfo] = useState<DfContentInfo>(randomDummyContentInfo());
  const [dummyMediaInfo, setDummyMediaInfo] = useState<MediaInfo>(randomMediaInfo(dummyContentInfo));

  useEffect(() => {
    setDummyMediaInfo(randomMediaInfo(dummyContentInfo));
  }, [dummyContentInfo]);

  useEffect(() => {
    return setTemplateExample(makeTemplateExample(template, dummyContentInfo, dummyMediaInfo, templateExample));
  }, [template, dummyMediaInfo]);
  const templateHelperText = `${templateExample?.value ? `${templateExample.value}` : ""}${templateExample?.error ? ` (template currently invalid: ${templateExample.error})` : ""}${templateExample?.unknownVarMessage ? `${templateExample.unknownVarMessage}` : ""}`;
  if (templateExample?.error) {
    console.log(templateExample.error);
  }
  // TODO: Ultimately I could make this better - treat tags as a single entity, if backspace after a tag  , remove the whole tag,
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
    if (!alwaysExpand && !e.currentTarget.contains(e.relatedTarget)) {
      setShowVariableList(false);
    }
  };
  const { isDirty } = useFormState();

  return (
    <Box onFocus={handleFocus} onBlur={handleBlur} tabIndex={-1} sx={{ width: "100%" }}>
      <Box display="flex" alignItems="center">
        <TextField
          name="filenameTemplate"
          label="Filename Template"
          FormHelperTextProps={{
            onClick: () => setDummyContentInfo(randomDummyContentInfo(dummyContentInfo.name)),
            sx: { cursor: 'pointer' }
          }}
          helperText={templateHelperText}
          autoComplete="off"
          value={template}
          onChange={handleTemplateChange}
          inputRef={textareaRef}
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Button onClick={() => setTemplate(initialValueRef.current)} disabled={!isDirty}>Reset</Button>
              </InputAdornment>
            ),
          }}
        />
      </Box>
      <Collapse in={showVariableList}>
        <Box mt={2} sx={{
          maxHeight: "50vh",
          overflow: 'auto',
          ...generalScrollbarProps}}>
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
            {filterAndMap(Object.entries(validHelpers), ([,entry]) => !entry.hidden, ([name, {description}]) => (
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