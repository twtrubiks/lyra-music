use lofty::config::WriteOptions;
use lofty::file::TaggedFileExt;
use lofty::tag::{Accessor, TagExt};
use std::path::Path;

use crate::error::AppError;

pub fn write_metadata(
    file_path: &str,
    title: Option<&str>,
    artist: Option<&str>,
    album: Option<&str>,
) -> Result<(), AppError> {
    let path = Path::new(file_path);
    let mut tagged_file = lofty::read_from_path(path)
        .map_err(|e| AppError::MetadataWrite(format!("Failed to read file: {e}")))?;

    let has_primary = tagged_file.primary_tag_mut().is_some();
    let has_any = has_primary || tagged_file.first_tag_mut().is_some();

    if has_any {
        // Safe: we just checked has_primary / has_any above, and the mutable borrows
        // from the checks have ended before we re-borrow here.
        #[allow(clippy::unwrap_used)]
        let tag = if has_primary {
            tagged_file.primary_tag_mut().unwrap()
        } else {
            tagged_file.first_tag_mut().unwrap()
        };

        if let Some(t) = title {
            tag.set_title(t.to_string());
        }
        if let Some(a) = artist {
            tag.set_artist(a.to_string());
        }
        if let Some(a) = album {
            tag.set_album(a.to_string());
        }
        tag.save_to_path(path, WriteOptions::default())
            .map_err(|e| AppError::MetadataWrite(format!("Failed to save tag: {e}")))?;
    } else {
        let tag_type = tagged_file.primary_tag_type();
        let mut tag = lofty::tag::Tag::new(tag_type);
        if let Some(t) = title {
            tag.set_title(t.to_string());
        }
        if let Some(a) = artist {
            tag.set_artist(a.to_string());
        }
        if let Some(a) = album {
            tag.set_album(a.to_string());
        }
        tag.save_to_path(path, WriteOptions::default())
            .map_err(|e| AppError::MetadataWrite(format!("Failed to save new tag: {e}")))?;
    }
    Ok(())
}
