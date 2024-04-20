import React from "react";

export type RichIconProps = React.ImgHTMLAttributes<HTMLImageElement>;

export const RichIcon = (props: RichIconProps) => {
  return <img src="/assets/icons/rich-icon.webp" width={"50"} alt="Rich Icon" {...props} />;
};
