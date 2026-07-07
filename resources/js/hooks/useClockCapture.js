import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Drives the clock screen: live camera + geolocation lock + frame capture.
 * The Presence Ring reads `geoProgress` (0..1) to fill as coordinates lock.
 */
export function useClockCapture() {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [coords, setCoords] = useState(null); // { lat, lng, accuracy }
    const [geoError, setGeoError] = useState('');
    const [geoProgress, setGeoProgress] = useState(0);
    const watchIdRef = useRef(null);

    // Start camera.
    useEffect(() => {
        let cancelled = false;
        async function start() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false,
                });
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {});
                }
                setCameraReady(true);
            } catch (err) {
                setCameraError(
                    err?.name === 'NotAllowedError'
                        ? 'Camera access was blocked. Enable it in your browser to clock in.'
                        : 'We couldn’t start your camera. Check that no other app is using it.'
                );
            }
        }
        start();
        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, []);

    // Watch geolocation; ring fills as accuracy improves.
    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setGeoError('This device can’t share its location.');
            return;
        }
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                setCoords({ lat: latitude, lng: longitude, accuracy });
                setGeoError('');
                // Map accuracy (m) to progress: <=20m => full, 200m => ~0.1.
                const p = Math.max(0.08, Math.min(1, 30 / Math.max(accuracy, 1)));
                setGeoProgress(p);
            },
            (err) => {
                setGeoError(
                    err.code === err.PERMISSION_DENIED
                        ? 'Location was blocked. We need it to verify where you clocked in.'
                        : 'We couldn’t get your location. Move to an open area and try again.'
                );
                setGeoProgress(0);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
        return () => {
            if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, []);

    /** Grab current frame → resized, compressed low-KB JPEG blob. */
    const capture = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return null;
        const maxEdge = 480;
        const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
        return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.5));
    }, []);

    const locked = coords && geoProgress >= 0.6;

    return { videoRef, cameraReady, cameraError, coords, geoError, geoProgress, locked, capture };
}
