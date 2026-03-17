
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  favoriteGenres: {
    type: [String],
    required: true,
  },
  join_time: {
    type: Date,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  reviews: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review',
      required: true,
    }
  ],
  username: {
    type: String,
    required: true,
    unique: true,
  },
  wishList: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    }
  ],
  avatarUrl: {
    type: String,
    required: true,
    default: '../../src/images/icons/User_Profile_Image_NoLogo.png'
  },
  readingStatus: [
    {
      bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Books', required: true },
      status: { type: String, enum: ['want_to_read', 'reading', 'have_read'], required: true },
      addedAt: { type: Date, default: Date.now }
    }
  ],
  customLists: [
    {
      name: { type: String, required: true, trim: true },
      books: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Books' }],
      createdAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

export default mongoose.model('User', UserSchema, 'users');