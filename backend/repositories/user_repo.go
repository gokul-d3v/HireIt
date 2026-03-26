package repositories

import (
	"context"
	"hireit-backend/models"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// UserRepository defines the interface for user data operations
type UserRepository interface {
	Create(ctx context.Context, user *models.User) (primitive.ObjectID, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByPhone(ctx context.Context, phone string) (*models.User, error)
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error)
	FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.User, error)
	UpsertCandidate(ctx context.Context, user *models.User) (*models.User, error)
	UpdatePassword(ctx context.Context, id primitive.ObjectID, hashedPassword string) error
	UpdateStatus(ctx context.Context, id primitive.ObjectID, disabled bool) error
	UpdateLastSeen(ctx context.Context, id primitive.ObjectID) error
	CountActiveUsers(ctx context.Context, since time.Time) (int64, error)
}

type mongoUserRepo struct {
	collection *mongo.Collection
}

// NewUserRepository creates a new MongoDB implementation of UserRepository
func NewUserRepository(collection *mongo.Collection) UserRepository {
	return &mongoUserRepo{collection: collection}
}

func (r *mongoUserRepo) Create(ctx context.Context, user *models.User) (primitive.ObjectID, error) {
	user.ID = primitive.NewObjectID()
	res, err := r.collection.InsertOne(ctx, user)
	if err != nil {
		return primitive.NilObjectID, err
	}
	return res.InsertedID.(primitive.ObjectID), nil
}

func (r *mongoUserRepo) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"email": email, "deleted_at": nil}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *mongoUserRepo) FindByPhone(ctx context.Context, phone string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"phone": phone, "deleted_at": nil}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *mongoUserRepo) FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"_id": id, "deleted_at": nil}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *mongoUserRepo) FindAll(ctx context.Context, filter bson.M, opts *options.FindOptions) ([]models.User, error) {
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	users := []models.User{}
	if err := cursor.All(ctx, &users); err != nil {
		return nil, err
	}
	return users, nil
}

func (r *mongoUserRepo) UpsertCandidate(ctx context.Context, user *models.User) (*models.User, error) {
	var existing models.User
	var filter bson.M

	if user.Email != "" {
		err := r.collection.FindOne(ctx, bson.M{"email": user.Email, "deleted_at": nil}).Decode(&existing)
		if err == nil {
			filter = bson.M{"_id": existing.ID}
		} else if err != mongo.ErrNoDocuments {
			return nil, err
		}
	}

	if filter == nil && user.Phone != "" {
		err := r.collection.FindOne(ctx, bson.M{"phone": user.Phone, "deleted_at": nil}).Decode(&existing)
		if err == nil {
			filter = bson.M{"_id": existing.ID}
		} else if err != mongo.ErrNoDocuments {
			return nil, err
		}
	}

	now := time.Now()
	if filter == nil {
		user.ID = primitive.NewObjectID()
		user.Role = "candidate"
		user.IsDemo = false
		if user.CreatedAt.IsZero() {
			user.CreatedAt = now
		}
		user.UpdatedAt = now

		_, err := r.collection.InsertOne(ctx, user)
		if err != nil {
			return nil, err
		}
		return user, nil
	}

	update := bson.M{
		"name":       user.Name,
		"email":      user.Email,
		"phone":      user.Phone,
		"role":       "candidate",
		"is_demo":    false,
		"updated_at": now,
	}

	_, err := r.collection.UpdateOne(ctx, filter, bson.M{"$set": update})
	if err != nil {
		return nil, err
	}

	return r.FindByID(ctx, existing.ID)
}

func (r *mongoUserRepo) UpdatePassword(ctx context.Context, id primitive.ObjectID, hashedPassword string) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"password": hashedPassword, "updated_at": time.Now()}},
	)
	return err
}

func (r *mongoUserRepo) UpdateStatus(ctx context.Context, id primitive.ObjectID, disabled bool) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"is_disabled": disabled, "updated_at": time.Now()}},
	)
	return err
}

func (r *mongoUserRepo) UpdateLastSeen(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"last_seen": time.Now()}},
	)
	return err
}

func (r *mongoUserRepo) CountActiveUsers(ctx context.Context, since time.Time) (int64, error) {
	return r.collection.CountDocuments(ctx, bson.M{
		"last_seen":  bson.M{"$gte": since},
		"deleted_at": nil,
	})
}
