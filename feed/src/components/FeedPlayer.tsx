import React, { useState, useEffect } from 'react';
import { Grid, Card, CardContent, CardMedia, Typography, CircularProgress, Chip, Box } from '@mui/material';
import axios from 'axios';

interface FeedPlayerProps {
  feedUrls: string; // Pipe-separated URLs
  feedType?: string; // Type of feed (nasa, seeclickfix, bsky, etc.)
  feedFields?: string[]; // Fields to display from the feed
}

interface FeedItem {
  title?: string;
  description?: string;
  url?: string;
  date?: string;
  explanation?: string;
  media_type?: string;
  source?: string;
  [key: string]: any; // Allow for dynamic fields
}

// Build a mapping of feed types to URLs
function buildFeedMap(feedUrls: string) {
  return feedUrls.split('|').reduce((acc, url) => {
    const type = detectFeedType(url.trim());
    acc[type] = url.trim();
    return acc;
  }, {} as Record<string, string>);
}

// Hash/feed handling and debug logs
function getFeedFromHash() {
  if (window.location.hash && window.location.hash.includes('feed=')) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    return params.get('feed'); // returns 'nasa', 'seeclickfix', etc.
  }
  return null;
}

function setFeedHash(feedType: string) {
  window.location.hash = `feed=${encodeURIComponent(feedType)}`;
}

const FeedPlayer: React.FC<FeedPlayerProps> = ({ feedUrls, feedType = 'default', feedFields = [] }) => {
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFeed, setActiveFeed] = useState<string | null>(null);

  const feedMap = buildFeedMap(feedUrls);
  const feedTypes = Object.keys(feedMap);

  const processFeedItem = (item: any, type: string, sourceUrl: string): FeedItem => {
    switch (type.toLowerCase()) {
      case 'nasa':
        return {
          title: item.title,
          description: item.explanation,
          url: item.url,
          date: item.date,
          media_type: item.media_type,
          source: 'NASA APOD'
        };
      
      case 'seeclickfix':
        return {
          title: item.summary || item.title,
          description: item.description,
          url: item.html_url || item.url,
          date: item.created_at || item.date,
          source: 'SeeClickFix',
          media_type: 'text'
        };

      case 'bsky':
        return {
          title: item.title,
          description: item.content || item.description,
          url: item.link || item.url,
          date: item.pubDate || item.date,
          source: 'BlueSky',
          media_type: 'text'
        };

      default:
        const processedItem: FeedItem = { source: sourceUrl };
        if (feedFields.length > 0) {
          feedFields.forEach(field => {
            processedItem[field] = item[field];
          });
        } else {
          Object.assign(processedItem, item);
        }
        return processedItem;
    }
  };

  const detectFeedType = (url: string): string => {
    if (url.includes('api.nasa.gov')) return 'nasa';
    if (url.includes('seeclickfix.com')) return 'seeclickfix';
    if (url.includes('bsky.app')) return 'bsky';
    if (url.includes('docs.google.com/spreadsheets')) return 'googlesheet';
    return 'default';
  };

  const processGoogleSheetUrl = (url: string): string => {
    // If URL is already in the correct format, return as is
    if (url.includes('/pub?') || url.includes('/gviz/tq?')) {
      return url;
    }

    // Extract sheet ID and convert to proper format
    const matches = url.match(/\/d\/(.*?)(\/|$)/);
    if (matches && matches[1]) {
      return `https://docs.google.com/spreadsheets/d/${matches[1]}/gviz/tq?tqx=out:csv`;
    }
    return url;
  };

  // On mount, handle hash/feed logic
  useEffect(() => {
    if (feedTypes.length === 0) return;
    const feedFromHash = getFeedFromHash();
    console.log('[DEBUG] feedTypes:', feedTypes);
    console.log('[DEBUG] feed from hash:', feedFromHash);
    if (feedFromHash && feedTypes.includes(feedFromHash)) {
      setActiveFeed(feedFromHash);
    } else {
      // Default to first feed type and set hash
      const defaultFeedType = feedTypes[0];
      setActiveFeed(defaultFeedType);
      setFeedHash(defaultFeedType);
      console.log('[DEBUG] No valid feed in hash, setting default feed and hash:', defaultFeedType);
    }
  }, [feedUrls]);

  // Listen for hash changes and update activeFeed
  useEffect(() => {
    const onHashChange = () => {
      const feedFromHash = getFeedFromHash();
      if (feedFromHash && feedTypes.includes(feedFromHash)) {
        setActiveFeed(feedFromHash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [feedTypes]);

  // Handler for feed selection
  const handleFeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFeedType = e.target.value;
    setFeedHash(newFeedType);
    // Do NOT call setActiveFeed here; let the hashchange event handle it
  };

  useEffect(() => {
    const fetchFeeds = async () => {
      try {
        if (!activeFeed) return;
        const selectedUrl = feedMap[activeFeed] || Object.values(feedMap)[0];
        if (!selectedUrl) throw new Error('No matching feed found for activeFeed');

        const feedType = detectFeedType(selectedUrl);
        const url = feedType === 'googlesheet' ? processGoogleSheetUrl(selectedUrl) : selectedUrl;

        const response = await axios.get(url);
        let data = response.data;

        let items: FeedItem[] = [];
        switch (feedType) {
          case 'nasa':
            data = Array.isArray(data) ? data : [data];
            items = data.map((item: any) => processFeedItem(item, 'nasa', url));
            break;
          case 'seeclickfix':
            const issues = response.data.issues || response.data;
            items = Array.isArray(issues)
              ? issues.map((item: any) => processFeedItem(item, 'seeclickfix', url))
              : [];
            break;
          case 'bsky':
            const itemsArr = response.data.items || response.data;
            items = Array.isArray(itemsArr)
              ? itemsArr.map((item: any) => processFeedItem(item, 'bsky', url))
              : [];
            break;
          case 'googlesheet':
            const rows = data.split('\n').map((row: string) => row.split(','));
            const headers = rows[0];
            items = rows.slice(1).map((row: string[]) => {
              const item: Record<string, any> = {};
              headers.forEach((header: string, index: number) => {
                item[header.trim()] = row[index]?.trim() || '';
              });
              return processFeedItem(item, 'googlesheet', url);
            });
            break;
          default:
            items = Array.isArray(data) ? data : [data];
        }

        if (items.length === 0) throw new Error('No feed data available');
        setFeeds(items);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch feed data');
        setLoading(false);
        console.error('Feed fetch error:', err);
      }
    };

    if (activeFeed) {
      fetchFeeds();
    }
  }, [feedUrls, feedType, feedFields, activeFeed]);

  if (loading) {
    return (
      <Grid container justifyContent="center" sx={{ mt: 4 }}>
        <CircularProgress />
      </Grid>
    );
  }

  if (error) {
    return (
      <Typography color="error" align="center" sx={{ mt: 4 }}>
        {error}
      </Typography>
    );
  }

  return (
    <>
      {/* Feed selection dropdown */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
        <select value={activeFeed || ''} onChange={handleFeedChange} style={{ fontSize: '1rem', padding: '0.5rem' }}>
          {feedTypes.map(type => (
            <option key={type} value={type}>
              {type.toUpperCase()} Feed
            </option>
          ))}
        </select>
      </Box>
      {/* Existing feed display */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        {feeds.map((item, index) => (
          <Box key={index} sx={{ width: { xs: '100%', md: '50%' }, p: 1.5 }}>
            <Card>
              {item.media_type === 'image' && item.url && (
                <CardMedia
                  component="img"
                  height="300"
                  image={item.url}
                  alt={item.title || 'Feed image'}
                  sx={{ objectFit: 'contain' }}
                />
              )}
              {item.media_type === 'video' && item.url && (
                <iframe
                  width="100%"
                  height="300"
                  src={item.url}
                  title={item.title || 'Feed video'}
                  frameBorder="0"
                  allowFullScreen
                />
              )}
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  {item.title && (
                    <Typography gutterBottom variant="h6" component="div">
                      {item.title}
                    </Typography>
                  )}
                  {item.source && (
                    <Chip 
                      label={item.source} 
                      size="small" 
                      color={
                        item.source === 'NASA APOD' ? 'primary' : 
                        item.source === 'SeeClickFix' ? 'secondary' : 
                        'default'
                      }
                      sx={{ ml: 1 }}
                    />
                  )}
                </Box>
                {item.description && (
                  <Typography variant="body2" color="text.secondary">
                    {item.description}
                  </Typography>
                )}
                {item.date && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Date: {item.date}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>
        ))}
      </Grid>
    </>
  );
};

export default FeedPlayer; 