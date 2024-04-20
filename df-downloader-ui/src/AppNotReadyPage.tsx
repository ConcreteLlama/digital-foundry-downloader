import { Box, Container, List, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { DiscListItem } from "./components/general/dist-list-item.component.tsx";
import { Loading } from "./components/general/loading.component.tsx";
import { selectIsLoading } from "./store/general.selector.ts";
import { queryServiceInfo } from "./store/service-info/service-info.actions.ts";
import { selectServiceError } from "./store/service-info/service-info.selector.ts";
import { store } from "./store/store.ts";

const retryFrequencySeconds = 30;

export const AppNotReadyPage = () => {
  const loading = useSelector(selectIsLoading("serviceInfo"));
  const serviceError = useSelector(selectServiceError);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        width: "100vw",
        backgroundColor: "background.default",
      }}
    >
      {loading && <Loading />}
      {serviceError && <ServiceError />}
    </Box>
  );
};

const ServiceError = () => {
  const serviceError = useSelector(selectServiceError);
  useEffect(() => {
    const interval = setInterval(() => {
      store.dispatch(queryServiceInfo.start());
    }, retryFrequencySeconds * 1000);
    return () => clearInterval(interval);
  }, [serviceError]);
  return (
    <Container>
      <Typography variant="h2" color="primary">
        Error
      </Typography>
      <RetryCountdown seconds={retryFrequencySeconds} />
      <Typography variant="body1" color="primary">
        There was an error connecting to the backend service.
      </Typography>
      <List>
        <DiscListItem>
          <Typography variant="body1" color="primary">
            If you're running the UI and backend separately, ensure the backend is running and accessible
          </Typography>
        </DiscListItem>
        <DiscListItem>
          <Typography variant="body1" color="primary">
            It's likely this is a CORS error - If you're running this in a container, ensure the "PUBLIC_ADDRESS"
            environment variable matches the address you're accessing the web UI on
          </Typography>
        </DiscListItem>
        <DiscListItem>
          <Typography variant="body1" color="primary">
            If you're running the UI and backend separately, or need to add more/custom allowed origins, set the
            "allowOrigin" property in config.yaml's rest.allowOrigin property to the address of your UI (e.g. if the
            backend runs on http://localhost:44556 and the UI runs on http://localhost:5173, set the allowOrigin
            property to http://localhost:5173)
          </Typography>
          <CodeBlock marginLeft={2}>
            {`rest:
  allowOrigin: http://127.0.0.1:44556`}
          </CodeBlock>
          <Typography variant="body1" color="primary">
            or for multiple origins:
          </Typography>
          <CodeBlock marginLeft={2}>
            {`rest:
  allowOrigin: 
    - http://127.0.0.1:44556
    - http://my-server:3000`}
          </CodeBlock>
        </DiscListItem>
        <DiscListItem>
          <Typography variant="body1" color="primary">
            If you still can't figure it out or need help, please drop me a message on the Discord server or raise a
            GitHub issue
          </Typography>
        </DiscListItem>
      </List>
    </Container>
  );
};

type RetryCountdownProps = {
  seconds: number;
};
const RetryCountdown = ({ seconds }: RetryCountdownProps) => {
  const [countdown, setCountdown] = useState(seconds);
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Typography variant="body1" color="primary">
      Retrying in {countdown} seconds...
    </Typography>
  );
};

type CodeBlockProps = {
  children: React.ReactNode;
} & React.ComponentProps<typeof Box>;
const CodeBlock = ({ children, ...props }: CodeBlockProps) => {
  return (
    <Box
      {...props}
      sx={{
        backgroundColor: "background.paper",
        color: "text.primary",
        padding: 2,
        borderRadius: 1,
        marginBottom: 2,
        overflowX: "auto",
        whiteSpace: "pre",
        ...(props.sx || {}),
      }}
    >
      {children}
    </Box>
  );
};
