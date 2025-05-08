import React, { useEffect, useState } from "react";
import axios from "axios";

const FeedPlayer = ({ feedUrls }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Helper: Extract best title, image, description, etc.
  const extractFields = (item) => ({
    title: item.title || item.summary || item.name || "Untitled",
    description: item.description || item.text || item.content || "",
    image:
      item.image_url ||
      (item.media && (item.media.image_full || item.media.representative_image_url)) ||
      item.url ||
      "",
    date: item.date || item.created_at || "",
    // Add more fields as needed
  });

  useEffect(() => {
    const fetchFeeds = async () => {
      setLoading(true);
      let allItems = [];
      const urls = feedUrls.split("|").map((u) => u.trim()).filter(Boolean);

      for (const url of urls) {
        try {
          let apiUrl = url;
          // SeeClickFix: Use localStorage lat/lon if present
          if (apiUrl.includes("seeclickfix.com")) {
            const lat = localStorage.getItem("latitude") || "41.307";
            const lon = localStorage.getItem("longitude") || "-72.925";
            apiUrl = apiUrl.replace("{latitude}", lat).replace("{longitude}", lon);
          }
          const response = await axios.get(apiUrl);
          let data = response.data.issues || response.data; // SeeClickFix or generic

          // SeeClickFix: filter for images and limit to 5
          if (apiUrl.includes("seeclickfix.com")) {
            data = data
              .filter(
                (item) =>
                  item.media &&
                  (item.media.image_full || item.media.representative_image_url)
              )
              .slice(0, 5);
          }

          allItems = allItems.concat(data);
        } catch (err) {
          allItems.push({
            title: "Failed to load feed",
            description: err.message,
            image: "",
          });
        }
      }
      setItems(allItems);
      setLoading(false);
    };

    fetchFeeds();
  }, [feedUrls]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {items.map((item, idx) => {
        const { title, description, image, date } = extractFields(item);
        return (
          <div key={idx} style={{ border: "1px solid #ccc", margin: 8, padding: 8 }}>
            {image && <img src={image} alt={title} style={{ maxWidth: 200 }} />}
            <h3>{title}</h3>
            <p>{description}</p>
            {date && <small>{date}</small>}
          </div>
        );
      })}
    </div>
  );
};

export default FeedPlayer; 