import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import loadingImage from "./assets/loading.gif";

import "./App.css";

const qualityOptions = new Map([
  [2160, "2160p (4K)"],
  [1440, "1440p (2K)"],
  [1080, "1080p"],
  [720, "720p"],
  [360, "360p"],
]);

const youtubeUrlPattern =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|playlist\?list=)|youtu\.be\/)[a-zA-Z0-9_-]+/;

function App() {
  const [url, setUrl] = useState("");
  const [downloads, setDownloads] = useState([]);
  const [folderPath, setFolderPath] = useState("");
  const [quality, setQuality] = useState(() => 1080);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleGenericError = useCallback(({ id, error }) => {
    if (id) {
      const element = document.getElementById(id);

      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          element.style.backgroundColor = "initial";
        }, 1500);
        element.style.backgroundColor = "lightgoldenrodyellow";
      }
    }

    setErrorMessage(error || "Unknown error occurred");
    setSnackbarVisible(true);
    setTimeout(() => {
      setSnackbarVisible(false);
    }, 6000);
  }, []);

  useEffect(() => {
    if (!window.electron) return;

    const handleDownloadProgress = ({ id, progress }) => {
      const split = progress.split(" ").filter(Boolean);
      let percentageDone;

      if (split[0] === "\r[download]") {
        percentageDone = split[1];
      }
      if (progress === "Download complete!") {
        percentageDone = "100%";
      }

      setDownloads((prevDownloads) =>
        prevDownloads.map((download) =>
          download.id === id
            ? {
                ...download,
                progress,
                ...(percentageDone && {
                  downloadProgress: percentageDone,
                }),
              }
            : download
        )
      );
    };

    const handleDownloadError = ({ id, error }) => {
      setDownloads((prevDownloads) =>
        prevDownloads.map((download) =>
          download.id === id ? { ...download, error } : download
        )
      );
    };

    window.electron.onDownloadProgress(handleDownloadProgress);
    window.electron.onDownloadError(handleDownloadError);
    window.electron.onGenericError(handleGenericError);

    const resetter = () => {
      window?.electron?.performGlobalReset?.();
    };

    const handleWindowFocus = () => {
      document.querySelector(".input-url")?.focus();
    };

    window.addEventListener("beforeunload", resetter);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("beforeunload", resetter);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [handleGenericError]);

  useEffect(() => {
    if (!window.electron) return;

    const getFolderPath = async () => {
      const storedFolder = await window.electron.storeGet("folderPath");
      if (storedFolder) {
        setFolderPath(storedFolder);
      }
    };

    getFolderPath();
  }, []);

  const handleSelectFolder = async () => {
    if (window.electron) {
      const selectedFolder = await window.electron.selectFolder();
      if (selectedFolder) {
        setFolderPath(selectedFolder);
        window.electron.storeSet("folderPath", selectedFolder);
      }
    }
  };

  const handleDownload = async () => {
    if (!window.electron) return;

    if (!folderPath) {
      handleGenericError({ error: "Select download folder first" });
      await handleSelectFolder();

      return;
    }

    const requestedUrl = url.trim();

    if (!requestedUrl) {
      handleGenericError({ error: "Specify the URL" });

      return;
    }

    if (!youtubeUrlPattern.test(requestedUrl)) {
      handleGenericError({ error: "Enter a valid YouTube URL" });
      return;
    }

    setUrl("");

    const duplicate = downloads.find((d) => d.url === requestedUrl);

    if (duplicate) {
      const { id, downloadProgress } = duplicate;
      handleGenericError({
        id,
        error:
          downloadProgress === "100%" ? "Already done" : "Already in progress",
      });

      return;
    }

    const id = uuidv4();

    setDownloads((prevDownloads) => [
      ...prevDownloads,
      {
        id,
        url: requestedUrl,
        progress: null,
        downloadProgress: null,
      },
    ]);

    window.electron.downloadVideo({
      id,
      url: requestedUrl,
      folderPath,
      quality,
    });

    const metadata = await window.electron.fetchVideoMetadata(requestedUrl);

    setDownloads((prevDownloads) =>
      prevDownloads.map((download) =>
        download.id === id ? { ...download, ...metadata } : download
      )
    );
  };

  return (
    <div className="container">
      <h2>YouTube Video Downloader</h2>

      <div className="video-spec">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleDownload()}
          placeholder="Enter YouTube URL"
          className="input-url"
          autoFocus
        />

        <select
          className="quality-dropdown"
          value={quality}
          onChange={(e) => setQuality(Number(e.target.value))}
        >
          {[...qualityOptions.keys()].map((option) => (
            <option key={option} value={option}>
              {qualityOptions.get(option)}
            </option>
          ))}
        </select>
      </div>

      <br />

      <div className="folder-spec">
        Path:{" "}
        <span className="folder-path" onClick={handleSelectFolder}>
          {folderPath || "click to specify"}
        </span>
      </div>

      {snackbarVisible && <div className="snackbar">{errorMessage}</div>}

      <div className="download-list">
        {downloads.map(
          ({
            id,
            url,
            title,
            thumbnail,
            duration,
            progress,
            downloadProgress,
          }) => (
            <div id={id} key={id} className="download-item">
              <div className="preview">
                <img
                  src={thumbnail || loadingImage}
                  alt={url}
                  className="thumbnail"
                  title={url}
                  onClick={() => window.open(url, "_blank").focus()}
                />
                {duration && <span className="duration">{duration}</span>}
              </div>
              <div className="text-content">
                <span
                  className="title one-line"
                  title={title || "Loading video title..."}
                >
                  {title || "Loading video title..."}
                </span>
                <span className="progress-text one-line" title={progress}>
                  {progress || "Pending..."}
                </span>
                <div
                  title={`Download progress: ${downloadProgress || "0%"}`}
                  className="progress-bar-container"
                >
                  <div
                    className="progress-bar"
                    style={{ width: downloadProgress || "0%" }}
                  />
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default App;
