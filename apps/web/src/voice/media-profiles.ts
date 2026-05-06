import {
  ScreenSharePresets,
  Track,
  VideoPresets,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type VideoCaptureOptions,
  type VideoEncoding,
  type VideoPreset,
  type VideoResolution,
} from "livekit-client";
import { VideoContentMode, VideoQualityProfile } from "@openvoice/shared";
import type {
  VideoContentMode as ContentMode,
  VideoQualityProfile as QualityProfile,
} from "@openvoice/shared";

export interface MediaProfileDefinition {
  readonly frameRate: number;
  readonly height: number;
  readonly width: number;
}

const CAMERA_PROFILE_BY_QUALITY: Record<QualityProfile, MediaProfileDefinition> = {
  [VideoQualityProfile.AUTO]: { frameRate: 30, height: 720, width: 1280 },
  [VideoQualityProfile.P720]: { frameRate: 30, height: 720, width: 1280 },
  [VideoQualityProfile.P1080]: { frameRate: 30, height: 1080, width: 1920 },
  [VideoQualityProfile.P1440]: { frameRate: 30, height: 1440, width: 2560 },
  [VideoQualityProfile.P4K]: { frameRate: 30, height: 2160, width: 3840 },
};

const SCREEN_PROFILE_BY_QUALITY: Record<QualityProfile, MediaProfileDefinition> = {
  [VideoQualityProfile.AUTO]: { frameRate: 30, height: 1080, width: 1920 },
  [VideoQualityProfile.P720]: { frameRate: 30, height: 720, width: 1280 },
  [VideoQualityProfile.P1080]: { frameRate: 30, height: 1080, width: 1920 },
  [VideoQualityProfile.P1440]: { frameRate: 30, height: 1440, width: 2560 },
  [VideoQualityProfile.P4K]: { frameRate: 30, height: 2160, width: 3840 },
};

export function createCameraCaptureOptions(
  quality: QualityProfile = VideoQualityProfile.P720,
  deviceId: string | null = null,
): VideoCaptureOptions {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    resolution: toResolution(CAMERA_PROFILE_BY_QUALITY[quality] ?? CAMERA_PROFILE_BY_QUALITY.auto),
  };
}

export function createScreenShareCaptureOptions(
  quality: QualityProfile = VideoQualityProfile.P1080,
  contentMode: ContentMode = VideoContentMode.DETAIL,
): ScreenShareCaptureOptions {
  return {
    audio: true,
    contentHint: contentMode,
    resolution: toResolution(SCREEN_PROFILE_BY_QUALITY[quality] ?? SCREEN_PROFILE_BY_QUALITY.auto),
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: "include",
    video: true,
  };
}

export function createCameraPublishOptions(
  quality: QualityProfile = VideoQualityProfile.P720,
): TrackPublishOptions {
  return {
    degradationPreference: "balanced",
    simulcast: true,
    source: Track.Source.Camera,
    videoEncoding: cloneVideoEncoding(videoPresetForQuality(quality).encoding),
    videoSimulcastLayers: cameraLayersForQuality(quality),
  };
}

export function createScreenSharePublishOptions(
  quality: QualityProfile = VideoQualityProfile.P1080,
  contentMode: ContentMode = VideoContentMode.DETAIL,
): TrackPublishOptions {
  return {
    degradationPreference:
      contentMode === VideoContentMode.DETAIL ? "maintain-resolution" : "maintain-framerate",
    screenShareEncoding: cloneVideoEncoding(screenPresetForQuality(quality, contentMode).encoding),
    screenShareSimulcastLayers: screenLayersForQuality(quality),
    simulcast: true,
    source: Track.Source.ScreenShare,
  };
}

function toResolution(profile: MediaProfileDefinition): VideoResolution {
  return {
    frameRate: profile.frameRate,
    height: profile.height,
    width: profile.width,
  };
}

function cloneVideoEncoding(encoding: VideoEncoding): VideoEncoding {
  return {
    maxBitrate: encoding.maxBitrate,
    ...(encoding.maxFramerate !== undefined ? { maxFramerate: encoding.maxFramerate } : {}),
    priority: "low",
  };
}

function videoPresetForQuality(quality: QualityProfile): VideoPreset {
  switch (quality) {
    case VideoQualityProfile.P1080:
      return VideoPresets.h1080;
    case VideoQualityProfile.P1440:
      return VideoPresets.h1440;
    case VideoQualityProfile.P4K:
      return VideoPresets.h2160;
    case VideoQualityProfile.AUTO:
    case VideoQualityProfile.P720:
      return VideoPresets.h720;
    default:
      return VideoPresets.h720;
  }
}

function screenPresetForQuality(quality: QualityProfile, contentMode: ContentMode): VideoPreset {
  if (contentMode === VideoContentMode.DETAIL) {
    switch (quality) {
      case VideoQualityProfile.P720:
        return ScreenSharePresets.h720fps5;
      case VideoQualityProfile.P1440:
        return VideoPresets.h1440;
      case VideoQualityProfile.P4K:
        return VideoPresets.h2160;
      case VideoQualityProfile.AUTO:
      case VideoQualityProfile.P1080:
        return ScreenSharePresets.h1080fps15;
      default:
        return ScreenSharePresets.h1080fps15;
    }
  }

  switch (quality) {
    case VideoQualityProfile.P720:
      return ScreenSharePresets.h720fps30;
    case VideoQualityProfile.P1440:
      return VideoPresets.h1440;
    case VideoQualityProfile.P4K:
      return VideoPresets.h2160;
    case VideoQualityProfile.AUTO:
    case VideoQualityProfile.P1080:
      return ScreenSharePresets.h1080fps30;
    default:
      return ScreenSharePresets.h1080fps30;
  }
}

function cameraLayersForQuality(quality: QualityProfile): VideoPreset[] {
  switch (quality) {
    case VideoQualityProfile.P1080:
      return [VideoPresets.h360, VideoPresets.h540];
    case VideoQualityProfile.P1440:
    case VideoQualityProfile.P4K:
      return [VideoPresets.h540, VideoPresets.h720];
    case VideoQualityProfile.AUTO:
    case VideoQualityProfile.P720:
      return [VideoPresets.h180, VideoPresets.h360];
    default:
      return [VideoPresets.h180, VideoPresets.h360];
  }
}

function screenLayersForQuality(quality: QualityProfile): VideoPreset[] {
  switch (quality) {
    case VideoQualityProfile.P720:
      return [ScreenSharePresets.h360fps3];
    case VideoQualityProfile.P1440:
    case VideoQualityProfile.P4K:
      return [ScreenSharePresets.h720fps5, ScreenSharePresets.h1080fps15];
    case VideoQualityProfile.AUTO:
    case VideoQualityProfile.P1080:
      return [ScreenSharePresets.h360fps3, ScreenSharePresets.h720fps15];
    default:
      return [ScreenSharePresets.h360fps3, ScreenSharePresets.h720fps15];
  }
}
