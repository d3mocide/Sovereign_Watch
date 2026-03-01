import { useState, useEffect } from 'react';

export function useInfraData() {
  const [cablesData, setCablesData] = useState<any>(null);
  const [landingPointsData, setLandingPointsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        const [cablesRes, landingPointsRes] = await Promise.all([
          fetch('/data/cable-geo.json'),
          fetch('/data/landing-point-geo.json')
        ]);

        if (!cablesRes.ok) throw new Error(`Failed to fetch cables: ${cablesRes.statusText}`);
        if (!landingPointsRes.ok) throw new Error(`Failed to fetch landing points: ${landingPointsRes.statusText}`);

        const cables = await cablesRes.json();
        const landingPoints = await landingPointsRes.json();

        if (isMounted) {
          setCablesData(cables);
          setLandingPointsData(landingPoints);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  return { cablesData, landingPointsData, isLoading, error };
}
