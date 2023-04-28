import { Document, Element, Text } from "domhandler";
import * as CSSSelect from "css-select";

export function getBodyOfChild(element?: Document | null) {
  if (!element) {
    return;
  }
  const textElement = element.children.find((element) => element instanceof Text);
  if (!textElement) {
    return;
  }
  return (textElement as Text).data.trim();
}

export function getBody(selector: string, parent?: Document | null) {
  const element = CSSSelect.selectOne(selector, parent);
  return getBodyOfChild(element);
}
