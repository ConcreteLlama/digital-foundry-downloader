export type YoutubeEmbedProps = {
  videoId: string;
} & (
  | {
      width?: string;
      height?: undefined;
      aspectRatio?: string;
    }
  | {
      width: string;
      height: string;
      aspectRatio: undefined;
    }
);

export const YouTubeEmbed = ({ videoId, width, height, aspectRatio }: YoutubeEmbedProps) => {
  return (
    <div
      style={{
        position: "relative",
        width: width || "100%",
        height: height,
        paddingBottom: height ? undefined : aspectRatio || "56.25%" /* 16:9 = 9/16 = 0.5625 */,
        paddingRight: "100%",
      }}
    >
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        style={{
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
        }}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    </div>
  );
};
