export const ExcalidrawPlusPromoBanner = ({
  isSignedIn,
}: {
  isSignedIn: boolean;
}) => {
  return (
    <a
      href={
        isSignedIn
          ? import.meta.env.VITE_APP_PLUS_APP
          : `${
              import.meta.env.VITE_APP_PLUS_LP
            }/plus?utm_source=aimtutor.ai&utm_medium=app&utm_content=guestBanner#aimtutorai-redirect`
      }
      target="_blank"
      rel="noopener"
      className="plus-banner"
    >
      aimtutor.ai+
    </a>
  );
};
